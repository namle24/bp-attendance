// Reserve enough pending accepts for a classroom burst on Windows as well as
// Linux. The OS may cap this queue; it does not replace classroom Wi-Fi testing.
const BACKLOG=4096;
function listen(app,port,host,callback){return app.listen({port,host,backlog:BACKLOG},callback);}
module.exports={listen,BACKLOG};
