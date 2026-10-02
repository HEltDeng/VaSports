const flow=require('../../utils/auth-flow');Page({onShow(){flow.guard('/pages/orders/index').catch(()=>{});},browse(){wx.switchTab({url:'/pages/venues/index'});}});
