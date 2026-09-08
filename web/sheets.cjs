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
  async write(values){
    await this.ensure();
    const rows=values.length,cols=values[0].length,grid=this.sheet.gridProperties;
    if(rows>grid.rowCount||cols>grid.columnCount){
      const next={rowCount:Math.max(rows,grid.rowCount),columnCount:Math.max(cols,grid.columnCount)};
      await this.request(':batchUpdate','POST',{requests:[{updateSheetProperties:{properties:{sheetId:this.sheet.sheetId,gridProperties:next},fields:'gridProperties.rowCount,gridProperties.columnCount'}}]});
      this.sheet.gridProperties=next;
    }
    const range="'"+this.config.sheetTitle+"'!A1:"+column(cols)+rows;
    await this.request('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW','PUT',{range,majorDimension:'ROWS',values});
  }
}
class SyncWorker {
  constructor(store,writer){this.store=store;this.writer=writer;this.busy=false;this.nextAt=0;this.failures=0;}
  status(){return {enabled:!!this.writer,pending:Number(this.store.meta('revision'))>Number(this.store.meta('synced')),lastSync:this.store.meta('lastSync'),error:this.store.meta('syncError'),busy:this.busy};}
  async sync(force=false){
    if(!this.writer||this.busy||(!force&&(Date.now()<this.nextAt||!this.status().pending)))return this.status();
    this.busy=true;
    try{
      const revision=this.store.meta('revision'),values=this.store.matrix();
      await this.writer.write(values);
      // Only acknowledge the snapshot written; records received during await remain pending.
      this.store.setMeta('synced',revision);this.store.setMeta('lastSync',new Date().toISOString());this.store.setMeta('syncError','');this.failures=0;this.nextAt=0;
    }catch(e){this.store.setMeta('syncError',e.message);this.failures++;this.nextAt=Date.now()+Math.min(60000,2000*2**Math.min(this.failures,5))+Math.random()*1000;}
    finally{this.busy=false;}
    return this.status();
  }
}
module.exports={SheetsWriter,SyncWorker,column};
