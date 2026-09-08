const {inspect}=require('./host-check.cjs');
const report=inspect();for(const item of report.checks)console.log((item.ok?'[OK] ':'[THIẾU] ')+item.name+' — '+item.detail);for(const warning of report.warnings)console.log(warning);if(!report.ready)process.exitCode=1;
