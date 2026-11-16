const api = require("../../utils/api");
const env = require("../../utils/env");

function requestPayment(options) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({ ...options, success: resolve, fail: reject });
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

Page({
  data: {
    loading: true,
    profile: {},
    payment: {
      title: "免费内测中",
      message: "当前已开放功能暂不收费。",
      paymentReady: false,
      documentDownloadFree: true,
      checklist: [],
      products: []
    },
    session: {},
    accountStorageKey: "已登录",
    canManagePayment: false,
    payingProductId: "",
    lastOrder: null,
    serviceCatalog: null, serviceOrders: [], serviceNote: '', serviceBusy: false
  },

  onShow() {
    const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    const roles = session.user || session;
    this.setData({
      session,
      accountStorageKey: session.user?.storageKey || "已登录",
      canManagePayment: Boolean(roles.isAdmin || roles.isOwner || roles.isTeacher || roles.canManageBookings)
    });
    this.loadProfile();
    this.loadServices();
  },

  loadServices(){
    Promise.all([api.request({url:'/api/mp/services/catalog'}),api.request({url:'/api/mp/service-orders'})]).then(([catalog,result])=>this.setData({serviceCatalog:catalog,serviceOrders:result.records||[]})).catch(()=>{});
  },
  editServiceNote(event){this.setData({serviceNote:event.detail.value||''});},
  async supplementService(event){
    if(this.data.serviceBusy)return;
    const order=this.data.serviceOrders.find(o=>o.id===event.currentTarget.dataset.id);if(!order)return;
    this.setData({serviceBusy:true});
    try{await api.request({url:'/api/mp/service-orders/update',method:'POST',data:{id:order.id,revision:order.revision,snapshot:{profile:this.data.profile,note:this.data.serviceNote}}});this.loadServices();wx.showToast({title:'已补充，待老师处理',icon:'none'});}
    catch(error){wx.showModal({title:'未能保存',content:error.message||'请刷新重试',showCancel:false});}finally{this.setData({serviceBusy:false});}
  },
  async reserveService(event){
    if(this.data.serviceBusy)return;
    const id=event.currentTarget.dataset.id,plan=this.data.serviceCatalog?.plans.find(p=>p.id===id);if(!plan)return;
    const agreed=await new Promise(resolve=>wx.showModal({title:'确认服务范围与资料授权',content:`${plan.scope}\n价格：${plan.priceText}。${this.data.serviceCatalog.disclaimer}\n同意将本单填写资料和联系方式提供给本公司文书老师处理吗？当前准备阶段仅建单，不扣款。`,confirmText:'同意建单',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));
    if(!agreed)return;this.setData({serviceBusy:true});
    try{
      await api.request({url:'/api/mp/service-orders',method:'POST',data:{productId:id,clientRequestId:`service-${Date.now()}-${Math.random().toString(36).slice(2)}`,termsVersion:this.data.serviceCatalog.termsVersion,acceptedTerms:true,shareWithTeacher:true,snapshot:{profile:this.data.profile,note:this.data.serviceNote}}});
      this.loadServices();wx.showToast({title:'已建单，尚未付款',icon:'none'});
    }catch(error){wx.showModal({title:'未能建单',content:error.message||'请稍后重试',showCancel:false});}finally{this.setData({serviceBusy:false});}
  },
  async checkoutService(event){
    if(this.data.serviceBusy)return;this.setData({serviceBusy:true});
    try{const result=await api.request({url:'/api/mp/service-orders/checkout',method:'POST',data:{id:event.currentTarget.dataset.id}});await requestPayment(result.payment);await this.confirmOrder(result.order.outTradeNo);this.loadServices();}
    catch(error){wx.showModal({title:'付款未完成',content:error.message||error.errMsg||'请稍后重试',showCancel:false});}
    finally{this.setData({serviceBusy:false});}
  },

  loadProfile() {
    this.setData({ loading: true });
    Promise.all([api.getProfile(), api.getPaymentStatus().catch(() => null)])
      .then(([result, payment]) => {
        const normalizedPayment = payment
          ? {
              ...this.data.payment,
              ...payment,
              checklist: Array.isArray(payment.checklist) ? payment.checklist : [],
              products: Array.isArray(payment.products) ? payment.products : []
            }
          : this.data.payment;
        this.setData({
          profile: result.profile || {},
          payment: normalizedPayment
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "账号读取失败", icon: "none" }))
      .finally(() => this.setData({ loading: false }));
  },

  copyAccountStorageKey() {
    if (!this.data.accountStorageKey || this.data.accountStorageKey === "已登录") return;
    wx.setClipboardData({
      data: this.data.accountStorageKey,
      success: () => wx.showToast({ title: "账号标识已复制", icon: "success" })
    });
  },

  startPayment(event) {
    const productId = String(event.currentTarget.dataset.productId || "");
    if (!productId || this.data.payingProductId) return;
    if (!this.data.payment.paymentReady) {
      wx.showModal({
        title: this.data.payment.title || "收费尚未开放",
        content: this.data.payment.message || "当前暂不能发起付款。",
        showCancel: false
      });
      return;
    }
    this.setData({ payingProductId: productId, lastOrder: null });
    const clientRequestId = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    api
      .createPayment(productId, clientRequestId)
      .then((result) =>
        requestPayment(result.payment).then(() => {
          this.setData({ lastOrder: result.order || null });
          return this.confirmOrder(result.order?.outTradeNo);
        })
      )
      .catch((error) => {
        const message = error?.errMsg || error?.message || "付款未完成";
        if (/cancel/i.test(message)) {
          wx.showToast({ title: "已取消付款", icon: "none" });
          return;
        }
        wx.showModal({ title: "付款未完成", content: message, showCancel: false });
      })
      .finally(() => this.setData({ payingProductId: "" }));
  },

  async confirmOrder(outTradeNo) {
    if (!outTradeNo) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await wait(1200);
      try {
        const result = await api.getPaymentOrder(outTradeNo);
        this.setData({ lastOrder: result.order || null });
        if (result.order?.status === "PAID") {
          wx.showModal({
            title: "支付成功",
            content: "服务权益已绑定到当前微信账号，可立即使用。",
            showCancel: false
          });
          this.loadProfile();
          return;
        }
      } catch (error) {
        if (attempt === 5) throw error;
      }
    }
    wx.showModal({
      title: "支付结果确认中",
      content: "微信支付结果可能稍有延迟，请稍后重新进入本页面查看权益状态。请勿重复付款。",
      showCancel: false
    });
  }
});
