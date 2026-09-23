// Winsock's SOMAXCONN asks the provider for its maximum reasonable accept queue.
// A numeric queue size is only a hint and may be capped differently on Windows.
// https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen
// Neither setting replaces testing the actual classroom Wi-Fi.
const BACKLOG=process.platform==='win32'?0x7fffffff:4096;
function listen(app,port,host,callback){
  const server=app.listen({port,host,backlog:BACKLOG},callback);
  // A slow 700-student batch must not hit the old 5 s idle deadline on
  // connections waiting for their next request to be processed. Keep the
  // same finite limits in production, fixtures and the load measurement.
  server.headersTimeout=15000;server.requestTimeout=20000;
  server.keepAliveTimeout=45000;server.keepAliveTimeoutBuffer=5000;
  server.setTimeout(30000,socket=>socket.destroy());
  return server;
}
module.exports={listen,BACKLOG};
