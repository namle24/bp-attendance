const {OAuth2Client}=require('google-auth-library');

// Keep the library's certificate expiry and JWT checks, but share a cold-cache fetch.
// Otherwise a class arriving together can all fetch the same public keys.
class AttendanceGoogleClient extends OAuth2Client {
  constructor(clientId,transporterOptions={}){
    super({clientId,transporterOptions});
    this.transporter.interceptors.request.add({resolved:options=>{
      options.timeout=8000;options.retry=false;options.retryConfig={retry:0,noResponseRetries:0};
      options.signal=AbortSignal.timeout(8000);return options;
    }});
  }
  getFederatedSignonCertsAsync(){
    if(!this.pendingCertificates){
      this.pendingCertificates=super.getFederatedSignonCertsAsync().finally(()=>{this.pendingCertificates=null;});
    }
    return this.pendingCertificates;
  }
}
module.exports={AttendanceGoogleClient};
