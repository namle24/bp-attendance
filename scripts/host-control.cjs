const operation=process.argv[2];
(operation==='start'?require('./start.cjs').start():require('./portable-host.cjs').portableHost(operation))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
