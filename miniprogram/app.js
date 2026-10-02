App({onLaunch(){require('./utils/brand-storage').migrate(wx);},globalData:{brand:'VaSports',mode:require('./config/runtime').mode}});
