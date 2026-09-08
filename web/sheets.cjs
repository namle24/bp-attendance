const {GoogleAuth}=require('google-auth-library');
const {randomUUID,randomInt}=require('node:crypto');
function column(number){let result='';while(number){number--;result=String.fromCharCode(65+number%26)+result;number=Math.floor(number/26);}return result;}
class SheetsWriter {
  constructor(config,store){this.config=config;this.store=store;this.auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']});}
  async request(suffix,method='GET',data){
    const client=await this.auth.getClient();
    try{return (await client.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(this.config.spreadsheetId)+suffix,method,data,timeout:15000})).data;}
    catch(e){throw Error('Google Sheets: '+(e.response?.status||'lỗi kết nối/cấp quyền')+'. Kiểm tra Sheets API, credentials và quyền sửa file.');}
  }
  async ensure(){
    if(this.sheet)return;
    if(!this.store.meta('sheetOwner'))this.store.setMeta('sheetOwner',randomUUID());
    const owner=this.store.meta('sheetOwner');
    const info=await this.request('?fields=sheets(properties,developerMetadata)');
    const existing=info.sheets?.find(s=>s.properties.title===this.config.sheetTitle);
    if(existing){
      if(!existing.developerMetadata?.some(m=>m.metadataKey==='bp_web_owner'&&m.metadataValue===owner))throw Error('Tab '+this.config.sheetTitle+' không thuộc database này. Dùng Sheet mới hoặc khôi phục database đúng; không ghi đè tab có sẵn.');
      this.sheet=existing.properties;
    }else{
      const id=randomInt(1,1000000000);
      await this.request(':batchUpdate','POST',{requests:[
        {addSheet:{properties:{sheetId:id,title:this.config.sheetTitle,gridProperties:{rowCount:1000,columnCount:30,frozenRowCount:1,frozenColumnCount:2}}}},
        {createDeveloperMetadata:{developerMetadata:{metadataKey:'bp_web_owner',metadataValue:owner,visibility:'DOCUMENT',location:{sheetId:id}}}}
      ]});
      this.sheet={sheetId:id,title:this.config.sheetTitle,gridProperties:{rowCount:1000,columnCount:30}};
    }
  }
  async write(values,snapshot){
    await this.ensure();
    const rows=values.length,cols=values[0].length,grid=this.sheet.gridProperties;
    if(rows>grid.rowCount||cols>grid.columnCount){
      const next={rowCount:Math.max(rows,grid.rowCount),columnCount:Math.max(cols,grid.columnCount)};
      await this.request(':batchUpdate','POST',{requests:[{updateSheetProperties:{properties:{sheetId:this.sheet.sheetId,gridProperties:next},fields:'gridProperties.rowCount,gridProperties.columnCount'}}]});
      this.sheet.gridProperties=next;
    }
    const range="'"+this.config.sheetTitle+"'!A1:"+column(cols)+rows;
    await this.request('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW','PUT',{range,majorDimension:'ROWS',values});
    if(snapshot){
      if(!this.detailWriter)this.detailWriter=new SheetsWriter({...this.config,sheetTitle:'BP_Offline_Check'},this.store);
      await this.detailWriter.write(snapshot.detail);
      const detailId=this.detailWriter.sheet.sheetId,mainId=this.sheet.sheetId;
      const white={red:1,green:1,blue:1},red={red:1,green:0.80,blue:0.80};
      const paint=(sheetId,startRowIndex,endRowIndex,startColumnIndex,endColumnIndex,color)=>({repeatCell:{range:{sheetId,startRowIndex,endRowIndex,startColumnIndex,endColumnIndex},cell:{userEnteredFormat:{backgroundColor:color}},fields:'userEnteredFormat.backgroundColor'}});
      // Both tabs belong to this database. Clear previous review colors, then apply
      // only the pending flags captured with this values snapshot (never live reads).
      const requests=[paint(mainId,0,values.length,0,cols,white),paint(detailId,0,snapshot.detail.length,0,snapshot.detail[0].length,white)];
      const groups=new Map();for(const cell of snapshot.red){if(!groups.has(cell.col))groups.set(cell.col,[]);groups.get(cell.col).push(cell.row);}
      function intervals(rows){const result=[];for(const row of [...new Set(rows)].sort((a,b)=>a-b)){const last=result.at(-1);if(last&&last[1]===row)last[1]++;else result.push([row,row+1]);}return result;}
      for(const [col,rows] of groups)for(const [start,end] of intervals(rows))requests.push(paint(mainId,start,end,col,col+1,red));
      for(const [start,end] of intervals(snapshot.detailRed))requests.push(paint(detailId,start,end,0,snapshot.detail[0].length,red));
      await this.request(':batchUpdate','POST',{requests});
    }
  }
}
class SyncWorker {
  constructor(store,writer){this.store=store;this.writer=writer;this.busy=false;this.nextAt=0;this.failures=0;}
  status(){return {enabled:!!this.writer,pending:Number(this.store.meta('revision'))>Number(this.store.meta('synced')),lastSync:this.store.meta('lastSync'),error:this.store.meta('syncError'),busy:this.busy};}
  async sync(force=false){
    if(!this.writer||this.busy||(!force&&(Date.now()<this.nextAt||!this.status().pending)))return this.status();
    this.busy=true;
    try{
      const revision=this.store.meta('revision'),snapshot=this.store.snapshot?.(),values=snapshot?.values||this.store.matrix();
      await this.writer.write(values,snapshot);
      // Only acknowledge the snapshot written; records received during await remain pending.
      this.store.setMeta('synced',revision);this.store.setMeta('lastSync',new Date().toISOString());this.store.setMeta('syncError','');this.failures=0;this.nextAt=0;
    }catch(e){this.store.setMeta('syncError',e.message);this.failures++;this.nextAt=Date.now()+Math.min(60000,2000*2**Math.min(this.failures,5))+Math.random()*1000;}
    finally{this.busy=false;}
    return this.status();
  }
}
module.exports={SheetsWriter,SyncWorker,column};
