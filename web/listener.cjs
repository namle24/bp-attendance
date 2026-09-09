// Winsock's SOMAXCONN asks the provider for its maximum reasonable accept queue.
// A numeric queue size is only a hint and may be capped differently on Windows.
// https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen
// Neither setting replaces testing the actual classroom Wi-Fi.
const BACKLOG=process.platform==='win32'?0x7fffffff:4096;
function listen(app,port,host,callback){return app.listen({port,host,backlog:BACKLOG},callback);}
module.exports={listen,BACKLOG};
