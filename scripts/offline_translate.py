"""JSON stdin/stdout; local neural MT only. Does not download or call external APIs."""
import json, os, pathlib, re, sys
import ctranslate2
import sentencepiece
ROOT = pathlib.Path(os.environ['MP_OFFLINE_MODEL_DIR'])
TERMS = {
 '南京农业大学': ('Nanjing Agricultural University', 'Nanjing Agricultural University'),
 '湖南省临澧县第一中学': ('Linli County No. 1 Middle School, Hunan', 'Linli Nr. 1 Mittelschule, Hunan'),
 '临澧文家乡中学': ('Wenjia Township Middle School, Linli', 'Wenjia-Mittelschule, Linli'),
 '石门县蒙泉镇完全小学': ('Mengquan Town Primary School, Shimen County', 'Grundschule Mengquan, Kreis Shimen'),
 '无锡先导智能装备股份有限公司': ('Wuxi Lead Intelligent Equipment Co., Ltd.', 'Wuxi Lead Intelligent Equipment Co., Ltd.'),
 '农业机器视觉实验室': ('Agricultural Machine Vision Laboratory', 'Labor für landwirtschaftliche Bildverarbeitung'),
 '嵌入式物联网工作室': ('Embedded IoT Studio', 'Studio für eingebettete IoT-Systeme'),
 '海外供应商质量工程师': ('Overseas Supplier Quality Engineer', 'Fachkraft für Qualitätssicherung internationaler Lieferanten'),
 '课题主持人': ('Project lead', 'Projektleitung'),
 '基于无人机多光谱图像的棉花枯萎病、黄萎病分类研究': ('Classification of cotton Fusarium wilt and Verticillium wilt using UAV multispectral imagery', 'Klassifikation von Fusarium- und Verticillium-Welke bei Baumwolle anhand multispektraler Drohnenbilder'),
 '基于无人机图像识别的棉花枯萎病、黄萎病分类研究项目': ('research project on classifying cotton Fusarium wilt and Verticillium wilt using UAV imagery', 'Forschungsprojekt zur Klassifikation von Fusarium- und Verticillium-Welke bei Baumwolle anhand von Drohnenbildern'),
 '客户反馈闭环处理': ('closed-loop resolution of customer feedback', 'systematische Bearbeitung von Kundenrückmeldungen'),
 '闭环整改': ('closure of corrective actions', 'Abschluss von Korrekturmaßnahmen'),
 '项目质量问题跟踪': ('tracking of project quality issues', 'Nachverfolgung von Qualitätsproblemen in Projekten'),
 '黄萎病': ('Verticillium wilt', 'Verticillium-Welke'),
 '高中': ('High school', 'Gymnasium'), '初中': ('Middle school', 'Mittelschule'), '小学': ('Primary school', 'Grundschule'),
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
NUMBER = re.compile(r'(?<![A-Za-z0-9])(?:\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?%?)(?![A-Za-z0-9])')
def verified_academic_background(value, lang):
    """Format only source facts that can be parsed without guessing."""
    if not re.search('[\u3400-\u9fff]', value): return None
    period = re.search(r'(\d{4})年(\d{1,2})月至(\d{4})年(\d{1,2})月', value)
    university = next((name for name in TERMS if name.endswith('大学') and name in value), None)
    major = next((name for name in TERMS if name == '农业电气化' and name in value), None)
    if not (period and university and major and '工学学士' in value): return None
    year1, month1, year2, month2 = map(int, period.groups())
    if not (1 <= month1 <= 12 and 1 <= month2 <= 12): return None
    months_en = ['January','February','March','April','May','June','July','August','September','October','November','December']
    months_de = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    school = TERMS[university][0 if lang == 'en' else 1]
    subject = TERMS[major][0 if lang == 'en' else 1]
    avg = re.search(r'平均(?:分|成绩)(?:为)?\s*(\d+(?:\.\d+)?)', value)
    gpa = re.search(r'绩点(?:为)?\s*(\d+(?:\.\d+)?)', value)
    if lang == 'en':
        text = f'From {months_en[month1-1]} {year1} to {months_en[month2-1]} {year2}, I studied {subject} at {school} and earned a Bachelor of Engineering.'
        if avg: text += f' My average score was {avg.group(1)}.'
        if gpa: text += f' My GPA was {gpa.group(1)}.'
    else:
        text = f'Von {months_de[month1-1]} {year1} bis {months_de[month2-1]} {year2} studierte ich {subject} an der {school} und erwarb einen Bachelor of Engineering.'
        if avg: text += f' Meine Durchschnittspunktzahl betrug {avg.group(1)}.'
        if gpa: text += f' Mein GPA betrug {gpa.group(1)}.'
    return text
def run():
    data=json.load(sys.stdin); lang=data['language']; fields=data['fields']
    if lang not in ('de','en'): raise ValueError('Unsupported language')
    if len(json.dumps(fields,ensure_ascii=False))>20000: raise ValueError('Input too long')
    rows=[]; count=0
    def queue_piece(field, part, separator='\n'):
        nonlocal count
        part=part.strip()
        if not part: return
        if part in TERMS:
            rows.append([field, TERMS[part][0 if lang=='en' else 1], None, separator]); return
        date_cell=re.fullmatch(r'(\d{4}-\d{2})\s*[–-]\s*(\d{4}-\d{2}|bis heute|present)', part)
        if date_cell:
            rows.append([field, f'{date_cell.group(1)} – {date_cell.group(2)}', None, separator]); return
        score=re.fullmatch(r'平均分\s*(\d+(?:\.\d+)?)\s*[，,;；]\s*绩点\s*(\d+(?:\.\d+)?)', part)
        if score:
            translated=(f'Average score: {score.group(1)}; GPA: {score.group(2)}' if lang=='en'
                        else f'Durchschnittspunktzahl: {score.group(1)}; GPA: {score.group(2)}')
            rows.append([field,translated,None,separator]); return
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
        def keep(m):
            nonlocal count
            token=f'ZXQ{count}ZXQ'; count+=1; mapping[token]=m.group(); return ' '+token+' '
        part=re.sub(r'\b(?!ZXQ\d+ZXQ\b)[A-Za-z][A-Za-z0-9+._-]*\b',keep,part)
        rows.append([field,part,mapping,separator])
    for field, value in fields.items():
        if not isinstance(value,str): raise ValueError('Invalid field')
        if field in ('schoolMajor', 'education'):
            verified = verified_academic_background(value, lang)
            if verified:
                rows.append([field, verified, None, '\n']); continue
        if field == 'targetProgram' and value.strip() == '电气工程硕士':
            rows.append([field, 'Master of Science in Electrical Engineering' if lang == 'en' else 'Masterstudium Elektrotechnik', None, '\n']); continue
        # Already Latin personal names must stay exact, never be translated.
        if field in ('latinName','name') and not re.search('[\u3400-\u9fff]',value):
            rows.append([field,value,None,'\n']); continue
        if field in ('education','schooling','tests','professionalExperience','researchProjects','publications','honors','activities','skills') and ' | ' in value:
            for line in value.splitlines():
                for index,cell in enumerate(line.split(' | ')):
                    queue_piece(field,cell,'\n' if index==0 else ' | ')
            continue
        sentences=re.split(r'(?<=[。！？])|\n+',value)
        parts=[]
        for sentence in sentences:
            if len(sentence)>180:
                parts.extend(re.split(r'(?<=[，；,;])',sentence))
            else: parts.append(sentence)
        for part in parts:
            queue_piece(field,part)
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
    output={key:'' for key in fields}
    for key,text,mapping,separator in rows:
        for token,value in (mapping or {}).items(): text=text.replace(token,' '+value+' ')
        text=re.sub(r'\s+([.,!?;:])',r'\1',text)
        text=re.sub(r'\s+',' ',text).strip()
        # These stock model artefacts have no source counterpart and must not
        # appear in a student's application document.
        text=re.sub(r"(?:I'm sorry\.?|It's not like I'm a bad person\.?|Es tut mir leid\.?|Es ist nicht so, als wäre ich ein schlechter Mensch\.?|♪[^♪]*♪)", '', text, flags=re.IGNORECASE).strip()
        if re.search('[\u3400-\u9fff]',text) or re.search(r'ZXQ\d+ZXQ',text): raise ValueError('Incomplete translation')
        output[key]+=(separator if output[key] else '')+text
    print(json.dumps(output,ensure_ascii=False))
if __name__=='__main__':
    try: run()
    except Exception as exc:
        # Never log student input or model output in production logs.
        detail=str(exc).replace('\n',' ')[:120]
        print('Offline translation validation failed: '+type(exc).__name__+' '+detail,file=sys.stderr); sys.exit(1)
