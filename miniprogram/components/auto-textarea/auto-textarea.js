Component({
  properties: {
    value: { type: String, value: "", observer(value) {
      if (this._layoutReady) this.setData({ displayValue: value || "" });
    } },
    placeholder: { type: String, value: "", observer(value) {
      if (this._layoutReady) this.setData({ displayPlaceholder: value || "" });
    } },
    maxlength: { type: Number, value: 500 },
    variant: { type: String, value: "" },
    strong: { type: Boolean, value: false }
  },
  data: { displayValue: "", displayPlaceholder: "" },
  lifetimes: {
    ready() {
      // Measure after this component is laid out. Pre-filled auto-height textareas
      // can otherwise measure a zero-width parent when a form step is first mounted.
      this.createSelectorQuery().select('.auto-input').boundingClientRect(() => {
        if (this._detached) return;
        this._layoutReady = true;
        this.setData({ displayValue: this.properties.value || "", displayPlaceholder: this.properties.placeholder || "" });
      }).exec();
    },
    detached() { this._detached = true; }
  },
  methods: {
    onInput(event) { this.triggerEvent('input', { value: event.detail.value }); }
  }
});
