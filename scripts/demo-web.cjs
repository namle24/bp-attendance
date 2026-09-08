// Works in Windows PowerShell as well as POSIX shells; does not load the live .env.
process.env.BP_MODE='demo';
require('../web/server.cjs');
