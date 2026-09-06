const STAGES = [
  {
    title: "1. 背景评估",
    time: "申请前 6-12 个月",
    desc: "整理成绩单、课程模块、语言情况和目标方向，先判断可申请范围。",
    tasks: ["完成院校专业匹配", "确认授课语言", "列出补课与材料缺口"]
  },
  {
    title: "2. 材料准备",
    time: "申请前 4-8 个月",
    desc: "准备 APS、成绩单、在读/毕业材料、CV、动机信和项目要求的课程模块证明。",
    tasks: ["启动 APS/学历材料", "完成文书调查表", "整理课程模块信息"]
  },
  {
    title: "3. 项目递交",
    time: "截止前 1-3 个月",
    desc: "按项目官网核对申请系统、截止日期、语言和额外文件。",
    tasks: ["检查官网要求", "提交申请系统", "保存递交凭证"]
  },
  {
    title: "4. 录取与签证",
    time: "拿到录取后",
    desc: "准备开户、保险、住宿、签证材料和入学注册。",
    tasks: ["确认录取条件", "规划签证材料", "安排行前事项"]
  }
];

Page({
  data: {
    stages: STAGES
  },

  goBooking() {
    wx.switchTab({ url: "/pages/booking/booking" });
  },

  goMaterials() {
    wx.navigateTo({ url: "/pages/materials/materials" });
  }
});
