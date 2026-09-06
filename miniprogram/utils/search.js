const schoolData = require("./schools");

const FEATURE_ITEMS = [
  {
    key: "feature-advisor",
    type: "feature",
    badge: "功能",
    title: "院校专业匹配",
    subtitle: "成绩单识别、专业推荐、证据审计",
    desc: "填写背景即可生成德国院校与专业推荐，成绩单可选。",
    url: "/pages/advisor/advisor",
    keywords: ["院校推荐", "专业匹配", "成绩单", "推荐结果", "学校推荐"]
  },
  {
    key: "feature-course",
    type: "feature",
    badge: "规划",
    title: "补课建议",
    subtitle: "按目标专业反推先修课缺口",
    desc: "结合成绩单与目标项目模块要求核对先修课缺口。",
    url: "/pages/course/course",
    keywords: ["补课", "先修课", "课程模块", "ECTS", "课程匹配"]
  },
  {
    key: "feature-plan",
    type: "feature",
    badge: "规划",
    title: "时间规划",
    subtitle: "申请节奏、材料节点、顾问预约",
    desc: "按申请阶段查看材料、语言、APS 和递交节点。",
    url: "/pages/plan/plan",
    keywords: ["时间规划", "时间线", "申请季", "截止日期", "APS"]
  },
  {
    key: "feature-news",
    type: "feature",
    badge: "资讯",
    title: "高校资讯",
    subtitle: "德国院校、政策与专业趋势",
    desc: "查看德国申请提醒、院校方向和政策摘要。",
    url: "/pages/news/news",
    keywords: ["高校资讯", "德国政策", "留学政策", "新闻", "申请提醒"]
  },
  {
    key: "feature-cv",
    type: "feature",
    badge: "文书",
    title: "留德申请个人简历生成",
    subtitle: "德语 / 英语结构初稿免费",
    desc: "按公司模板整理教育、实习、项目、获奖和技能经历，生成水印 PDF。",
    url: "/pages/tools/tools?tool=cv",
    keywords: ["简历", "CV", "个人信息", "实习", "项目"]
  },
  {
    key: "feature-motivation",
    type: "feature",
    badge: "文书",
    title: "动机申请信生成",
    subtitle: "本科/硕士要求与目标学校要求",
    desc: "填写目标专业、课程、经历和职业规划，生成中文动机申请信初稿。",
    url: "/pages/tools/tools?tool=motivation",
    keywords: ["动机信", "Motivation Letter", "文书", "申请理由"]
  },
  {
    key: "feature-consult",
    type: "feature",
    badge: "咨询",
    title: "1v1问答",
    subtitle: "提交申请问题给内部顾问",
    desc: "整理问题、材料背景和紧急程度，便于顾问后续答复。",
    url: "/pages/consult/consult",
    keywords: ["1v1", "问答", "咨询", "顾问", "问题"]
  },
  {
    key: "feature-materials",
    type: "feature",
    badge: "材料",
    title: "申请材料清单",
    subtitle: "材料状态、文书初稿、进度管理",
    desc: "查看护照、成绩单、APS、语言和文书材料准备进度。",
    url: "/pages/materials/materials",
    keywords: ["材料", "清单", "APS", "语言", "进度"]
  },
  {
    key: "feature-courses",
    type: "feature",
    badge: "网课",
    title: "网课中心",
    subtitle: "录播课、直播课、微信账号绑定",
    desc: "查看绑定当前微信号的录播课和直播课。",
    url: "/pages/courses/courses",
    keywords: ["网课", "录播课", "直播课", "课程", "CCtalk", "学习"]
  },
  {
    key: "feature-account",
    type: "feature",
    badge: "账户",
    title: "账户绑定",
    subtitle: "微信登录权限与公司账户",
    desc: "绑定公司账户，一个微信对应一个学习和服务权限。",
    url: "/pages/account/account",
    keywords: ["账户", "绑定", "微信", "公司账户", "权限"]
  },
  {
    key: "feature-results",
    type: "feature",
    badge: "结果",
    title: "推荐结果",
    subtitle: "查看最近一次匹配结果",
    desc: "查看院校专业推荐、专业库覆盖和证据审计。",
    url: "/pages/results/results",
    keywords: ["推荐结果", "证据审计", "专业库", "匹配结果"]
  },
  {
    key: "feature-about",
    type: "feature",
    badge: "品牌",
    title: "关于我们",
    subtitle: "留德小栈服务说明",
    desc: "了解服务边界、内部流程和使用说明。",
    url: "/pages/about/about",
    keywords: ["关于我们", "留德小栈", "服务说明", "品牌"]
  }
];

const NEWS_ITEMS = [
  {
    key: "news-aps",
    type: "news",
    badge: "政策",
    title: "APS 与学历材料",
    subtitle: "中国大陆学历常见材料核验",
    desc: "成绩单、在读证明、毕业证学位证和翻译件建议尽早准备。",
    url: "/pages/news/news?tab=policy",
    keywords: ["APS", "学历", "成绩单", "材料", "审核"]
  },
  {
    key: "news-language",
    type: "news",
    badge: "政策",
    title: "授课语言与申请季",
    subtitle: "英语/德语授课与冬夏季入学",
    desc: "项目匹配时需要同步核对授课语言、申请截止和入学季。",
    url: "/pages/news/news?tab=policy",
    keywords: ["语言", "IELTS", "TOEFL", "TestDaF", "冬季", "夏季"]
  },
  {
    key: "news-talent",
    type: "news",
    badge: "就业",
    title: "德国紧缺人才方向",
    subtitle: "工程、IT、数据与就业路径",
    desc: "工程、IT、数据等方向可结合实习、蓝卡和长期就业路径规划。",
    url: "/pages/news/news?tab=talent",
    keywords: ["人才引进", "蓝卡", "就业", "IT", "工程"]
  }
];

function textOf(value) {
  if (Array.isArray(value)) return value.join(" ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalize(value) {
  return textOf(value).toLowerCase();
}

function buildSchoolItems() {
  const schools = schoolData.getSchools();
  const schoolItems = schools.map((school) => ({
    key: `school-${school.id}`,
    type: "school",
    badge: "院校",
    title: school.name,
    subtitle: `${school.englishName} · ${school.cityDisplay}`,
    desc: school.summary,
    logo: school.logo,
    url: `/pages/school/school?id=${school.id}`,
    keywords: [
      school.name,
      school.id,
      school.rank,
      school.englishName,
      school.germanName,
      school.city,
      school.state,
      school.cityDisplay,
      school.stateDisplay,
      school.type,
      school.strengths,
      school.programs,
      school.fitFor
    ]
  }));

  const programItems = [];
  schools.forEach((school) => {
    school.programs.forEach((program, index) => {
      programItems.push({
        key: `program-${school.id}-${index}`,
        type: "program",
        badge: "专业",
        title: program,
        subtitle: `${school.name} · ${school.cityDisplay}`,
        desc: `该方向在 ${school.name} 的院校资料中可继续核对课程、语言和申请材料要求。`,
        logo: school.logo,
        url: `/pages/school/school?id=${school.id}`,
        keywords: [program, school.id, school.name, school.englishName, school.strengths, school.fitFor]
      });
    });
  });

  return schoolItems.concat(programItems);
}

function getAllSearchItems() {
  return buildSchoolItems().concat(FEATURE_ITEMS, NEWS_ITEMS);
}

function scoreItem(item, query) {
  const parts = normalize(query).split(/\s+/).filter(Boolean);
  if (!parts.length) return 1;

  const title = normalize(item.title);
  const subtitle = normalize(item.subtitle);
  const desc = normalize(item.desc);
  const keywords = normalize(item.keywords);
  let score = 0;

  parts.forEach((part) => {
    if (title.includes(part)) score += 12;
    if (subtitle.includes(part)) score += 8;
    if (keywords.includes(part)) score += 6;
    if (desc.includes(part)) score += 3;
  });

  if (score && item.type === "school") score += 2;
  return score;
}

function search(query, limit) {
  const items = getAllSearchItems();
  const cleanQuery = textOf(query).trim();
  const max = limit || 60;

  if (!cleanQuery) {
    return items.filter((item) => item.type !== "program").slice(0, max);
  }

  return items
    .map((item) => ({ ...item, score: scoreItem(item, cleanQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

function getPopularKeywords() {
  return ["TUM", "柏林", "机器人", "数据科学", "动机信", "APS", "网课", "蓝卡"];
}

module.exports = {
  search,
  getAllSearchItems,
  getPopularKeywords
};
