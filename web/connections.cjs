// Bounded, in-memory diagnostics. Never record names, MSSV, codes, cookies or URL queries.
function connections(clock=Date.now){
  const rows=new Map(),since=clock();
  return {
    middleware(req,res,next){
      const ip=req.socket.remoteAddress,at=clock();
      if(!rows.has(ip)&&rows.size>=1000)rows.delete(rows.keys().next().value);
      let row=rows.get(ip);if(!row){row={ip,at,requests:0,page:false,api:false,status:0};rows.set(ip,row);}
      row.at=at;row.requests++;
      if(['/', '/check-in','/student.html','/simple','/history','/readyz'].includes(req.path))row.page=true;
      if(req.path.startsWith('/api/'))row.api=true;
      res.once('finish',()=>{row.status=res.statusCode;});next();
    },
    snapshot(){return {since,rows:[...rows.values()].filter(r=>clock()-r.at<30*60000).sort((a,b)=>b.at-a.at)};}
  };
}
module.exports={connections};
