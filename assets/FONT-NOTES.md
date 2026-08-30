# PDF font

PDF exports use `NotoSansSC-Regular.ttf`, a static weight-400 instance of the
bundled `NotoSansSC-VF.ttf`. This prevents PDFKit from selecting the variable
font's Thin default and producing faint text on mobile readers.

Rebuilt with FontTools 4.63.0:

```
python -m fontTools.varLib.instancer NotoSansSC-VF.ttf wght=400 --update-name-table --output NotoSansSC-Regular.ttf
```

The original SIL Open Font License is included in `NotoSansSC-OFL.txt`.
FontTools reference: https://fonttools.readthedocs.io/en/latest/varLib/instancer.html
