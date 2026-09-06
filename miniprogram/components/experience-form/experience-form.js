const experience = require("../../utils/experience");
Component({
  properties: { value: { type: Object, value: {}, observer: "rebuild" } },
  data: { groups: [], gapExplanation: "" },
  lifetimes: { attached() { this.rebuild(this.data.value); } },
  methods: {
    rebuild(value = {}) { this.setData({ groups: experience.GROUPS.map((group) => ({ ...group, rows: (value[group.key] || []).map((row) => ({ ...row, fields: group.fields.map(([key, label]) => ({ key, label, value: row[key] || "", long: key === "details" })) })) })), gapExplanation: value.gapExplanation || "" }); },
    commit(value) { experience.save(value); this.triggerEvent("change", { value, form: experience.toForm(value), errors: experience.validate(value) }); },
    add(event) { const key = event.currentTarget.dataset.group; if (!experience.GROUPS.some((group) => group.key === key)) return; const value = { ...this.data.value, [key]: [...(this.data.value[key] || []), { id: `row-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, name: "", start: "", end: "", ongoing: false }] }; this.commit(value); },
    remove(event) { const { group, index } = event.currentTarget.dataset; wx.showModal({ title: "移除这段经历？", content: "只移除当前填写记录，不会删除你上传的原始文件。", success: (result) => { if (result.confirm) this.commit({ ...this.data.value, [group]: (this.data.value[group] || []).filter((_, i) => i !== Number(index)) }); } }); },
    update(event) { const { group, index, key } = event.currentTarget.dataset; if (!group) { this.commit({ ...this.data.value, gapExplanation: event.detail.value }); return; } const rows = (this.data.value[group] || []).map((row, i) => i === Number(index) ? { ...row, [key]: event.detail.value } : row); this.commit({ ...this.data.value, [group]: rows }); }
  }
});
