function client(origin){
  let cookie='';
  return {
    get cookie(){return cookie;},
    async request(route,data,headers={}){
      const response=await fetch(origin+route,{...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)}),headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers}});
      const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
      return {status:response.status,body:await response.json(),headers:response.headers};
    }
  };
}
module.exports={client};
