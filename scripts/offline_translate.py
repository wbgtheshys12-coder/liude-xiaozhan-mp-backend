"""JSON stdin/stdout; local neural MT only. Does not download or call external APIs."""
import json, os, pathlib, re, sys
import ctranslate2
import sentencepiece
ROOT = pathlib.Path(os.environ['MP_OFFLINE_MODEL_DIR'])
TERMS = {
 '农业电气化': ('Agricultural Electrification', 'Elektrifizierung der Landwirtschaft'),
 '工学学士学位': ('Bachelor of Engineering', 'Bachelor of Engineering'),
 '工学学士': ('Bachelor of Engineering', 'Bachelor of Engineering'),
 '绩点': ('GPA','GPA'), '平均成绩': ('average score','durchschnittliche Punktzahl'),
 '无人机': ('unmanned aerial vehicle','Drohne'),
 '棉花枯萎病': ('cotton wilt disease','Welkekrankheit bei Baumwolle'),
 '支持向量机': ('support vector machine','Support-Vector-Maschine'),
 '德语考试': ('German language examination','Deutschprüfung'),
 '论文': ('academic paper','wissenschaftliche Arbeit'),
}
DATE_RANGE = re.compile(r'(?<!\d)(\d{4}(?:[-/.]\d{1,2})?)(?:至|到)(\d{4}(?:[-/.]\d{1,2})?|今)(?!\d)')
NUMBER = re.compile(r'(?<![\w])(?:\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?%?)(?![\w])')
def run():
    data=json.load(sys.stdin); lang=data['language']; fields=data['fields']
    if lang not in ('de','en'): raise ValueError('Unsupported language')
    if len(json.dumps(fields,ensure_ascii=False))>20000: raise ValueError('Input too long')
    rows=[]; protected={}; count=0
    for field, value in fields.items():
        if not isinstance(value,str): raise ValueError('Invalid field')
        # Already Latin personal names must stay exact, never be translated.
        if field in ('latinName','name') and not re.search('[\u3400-\u9fff]',value):
            rows.append([field,value,None]); continue
        sentences=re.split(r'(?<=[。！？])|\n+',value)
        parts=[]
        for sentence in sentences:
            if len(sentence)>180:
                parts.extend(re.split(r'(?<=[，；,;])',sentence))
            else: parts.append(sentence)
        for part in parts:
            if not part.strip(): continue
            mapping={}
            def keep_date_range(m):
                nonlocal count
                token=f'ZXQ{count}ZXQ'; count+=1
                end='heute' if m.group(2)=='今' and lang=='de' else 'present' if m.group(2)=='今' else m.group(2)
                connector=' bis ' if lang=='de' else ' to '
                mapping[token]=m.group(1)+connector+end
                return ' '+token+' '
            part=DATE_RANGE.sub(keep_date_range,part)
            def keep_number(m):
                nonlocal count
                token=f'ZXQ{count}ZXQ'; count+=1; mapping[token]=m.group(); return ' '+token+' '
            part=NUMBER.sub(keep_number,part)
            for term,pair in sorted(TERMS.items(),key=lambda x:-len(x[0])):
                if term in part:
                    token=f'ZXQ{count}ZXQ'; count+=1; mapping[token]=pair[0 if lang=='en' else 1]
                    part=part.replace(term,' '+token+' ')
            # Protect technology names and original Latin names from corruption.
            def keep(m):
                nonlocal count
                token=f'ZXQ{count}ZXQ'; count+=1; mapping[token]=m.group(); return ' '+token+' '
            part=re.sub(r'\b(?!ZXQ\d+ZXQ\b)[A-Za-z][A-Za-z0-9+._-]*\b',keep,part)
            rows.append([field,part,mapping])
    if len(rows)>150: raise ValueError('Too many paragraphs')
    for pair in (['zh-en'] if lang=='en' else ['zh-en','en-de']):
        base=ROOT/pair
        model=next(base.rglob('model.bin')).parent
        sp=sentencepiece.SentencePieceProcessor(model_file=str(next(base.rglob('sentencepiece.model'))))
        engine=ctranslate2.Translator(str(model),device='cpu',compute_type='int8',intra_threads=1,inter_threads=1)
        for row in rows:
            if row[2] is None: continue
            if pair=='zh-en' and not re.search('[\u3400-\u9fff]',row[1]): continue
            tokens_to_keep=list(row[2])
            pieces=re.split('('+ '|'.join(map(re.escape,tokens_to_keep)) +')',row[1]) if tokens_to_keep else [row[1]]
            translated=[]
            for piece in pieces:
                if piece in row[2]: translated.append(piece); continue
                if not piece.strip(): translated.append(piece); continue
                token_ids=sp.encode(piece,out_type=str)
                if len(token_ids)>450: raise ValueError('Paragraph too long; split the text')
                result=engine.translate_batch([token_ids],beam_size=2,max_decoding_length=512)[0].hypotheses[0]
                if len(result)>=512: raise ValueError('Truncated translation')
                translated.append(sp.decode(result).replace('▁',' ').strip())
            row[1]=''.join(translated)
            for token in row[2]:
                if row[1].count(token)!=1: raise ValueError('Protected terminology lost in '+row[0]+' ('+token+')')
        del engine
    output={key:[] for key in fields}
    for key,text,mapping in rows:
        for token,value in (mapping or {}).items(): text=text.replace(token,value)
        if re.search('[\u3400-\u9fff]',text) or re.search(r'ZXQ\d+ZXQ',text): raise ValueError('Incomplete translation')
        output[key].append(text)
    print(json.dumps({key:'\n'.join(value) for key,value in output.items()},ensure_ascii=False))
if __name__=='__main__':
    try: run()
    except Exception as exc:
        # Never log student input or model output in production logs.
        detail=str(exc).replace('\n',' ')[:120]
        print('Offline translation validation failed: '+type(exc).__name__+' '+detail,file=sys.stderr); sys.exit(1)
