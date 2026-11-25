"""User-facing server messages in the UI's languages.

The UI sends its language as `Accept-Language` ("it", "en", "ja"…); an app-wide dependency
puts it in `LOCALE` for the request. A search runs in a background thread, which keeps the language
of the request that started it.
"""

from contextvars import ContextVar
from typing import Literal

Locale = Literal[
    "it", "en", "de", "ko", "zh", "es", "fr", "ja", "pt", "ru", "id", "nl", "tr"
]  # fmt: skip
LOCALES: tuple[Locale, ...] = Locale.__args__
DEFAULT: Locale = "it"

LOCALE: ContextVar[Locale] = ContextVar("locale", default=DEFAULT)

MESSAGES: dict[str, dict[Locale, str]] = {
    # Planning a search (query.plan)
    "need_where": {
        "it": "Aggiungi almeno un filtro «Dove» per sapere dove cercare.",
        "en": "Add at least one “Where” filter so we know where to search.",
        "de": "Füge mindestens einen „Wo“-Filter hinzu, damit wir wissen, wo gesucht wird.",
        "ko": "어디서 검색할지 알 수 있도록 “지역” 필터를 하나 이상 추가하세요.",
    },
    "need_title": {
        "it": "Aggiungi almeno una keyword in «Titolo contiene»: è il termine di ricerca sui portali.",
        "en": "Add at least one keyword in “Title contains”: it's the term searched on the job boards.",
        "de": "Füge mindestens ein Stichwort bei „Titel enthält“ hinzu: es ist der Suchbegriff auf den Jobportalen.",
        "ko": "“직함 포함”에 키워드를 하나 이상 추가하세요: 채용 사이트에서 검색하는 검색어입니다.",
    },
    "too_many": {
        "it": "La query genera {n} ricerche: il massimo nella POC è {max}.",
        "en": "The query makes {n} searches: the maximum in the POC is {max}.",
        "de": "Die Suche ergibt {n} Einzelsuchen: das Maximum im POC ist {max}.",
        "ko": "이 검색은 {n}개의 개별 검색이 됩니다: POC의 최대값은 {max}개입니다.",
    },
    "indeed_country": {
        "it": "Indeed cerca solo dentro un paese",
        "en": "Indeed only searches within one country",
        "de": "Indeed sucht nur innerhalb eines Landes",
        "ko": "Indeed는 한 국가 안에서만 검색합니다",
    },
    "indeed_uncovered": {
        "it": "Indeed non copre {country}",
        "en": "Indeed doesn't cover {country}",
        "de": "Indeed deckt {country} nicht ab",
        "ko": "Indeed는 {country}을(를) 지원하지 않습니다",
    },
    # Running it (scraper)
    "busy": {
        "it": "Una ricerca è già in corso",
        "en": "A search is already running",
        "de": "Es läuft bereits eine Suche",
        "ko": "이미 검색이 진행 중입니다",
    },
    "nothing_to_run": {
        "it": "Nessuna ricerca da eseguire con questi filtri.",
        "en": "No searches to run with these filters.",
        "de": "Mit diesen Filtern gibt es keine Suche auszuführen.",
        "ko": "이 필터로 실행할 검색이 없습니다.",
    },
    "paused": {
        "it": "{site} ha limitato le richieste: in pausa fino alle {time}",
        "en": "{site} throttled the requests: paused until {time}",
        "de": "{site} hat die Anfragen begrenzt: pausiert bis {time}",
        "ko": "{site}이(가) 요청을 제한했습니다: {time}까지 일시 중지",
    },
    "budget": {
        "it": "raggiunto il limite di {n} richieste a {site} nelle ultime 24 ore: riprova più tardi",
        "en": "reached the limit of {n} requests to {site} in the last 24 hours: try again later",
        "de": "Limit von {n} Anfragen an {site} in den letzten 24 Stunden erreicht: versuche es später",
        "ko": "최근 24시간 동안 {site} 요청 한도 {n}회에 도달했습니다: 나중에 다시 시도하세요",
    },
    "throttled": {
        "it": "il portale ha limitato le richieste: riprova più tardi",
        "en": "the job board throttled the requests: try again later",
        "de": "das Jobportal hat die Anfragen begrenzt: versuche es später",
        "ko": "채용 사이트가 요청을 제한했습니다: 나중에 다시 시도하세요",
    },
    "timeout": {
        "it": "il portale non ha risposto in tempo",
        "en": "the job board didn't answer in time",
        "de": "das Jobportal hat nicht rechtzeitig geantwortet",
        "ko": "채용 사이트가 제때 응답하지 않았습니다",
    },
    "board_error": {
        "it": "il portale ha restituito un errore",
        "en": "the job board returned an error",
        "de": "das Jobportal hat einen Fehler gemeldet",
        "ko": "채용 사이트가 오류를 반환했습니다",
    },
    "missed": {
        "it": "{n} non lette ({why}): riprovo alla prossima ricerca",
        "en": "{n} not read ({why}): retrying on the next search",
        "de": "{n} nicht gelesen ({why}): neuer Versuch bei der nächsten Suche",
        "ko": "{n}건을 읽지 못함 ({why}): 다음 검색 때 다시 시도합니다",
    },
    "missed_budget": {
        "it": "limite giornaliero di richieste raggiunto",
        "en": "daily request limit reached",
        "de": "tägliches Anfragelimit erreicht",
        "ko": "일일 요청 한도 도달",
    },
    "missed_page": {
        "it": "pagina dell'annuncio non leggibile",
        "en": "posting page not readable",
        "de": "Anzeigenseite nicht lesbar",
        "ko": "채용공고 페이지를 읽을 수 없음",
    },
    # API
    "saved_not_found": {
        "it": "Ricerca salvata non trovata",
        "en": "Saved search not found",
        "de": "Gespeicherte Suche nicht gefunden",
        "ko": "저장된 검색을 찾을 수 없습니다",
    },
    "ui_not_built": {
        "it": "UI non compilata: esegui `npm run build` in web/",
        "en": "UI not built: run `npm run build` in web/",
        "de": "UI nicht gebaut: führe `npm run build` in web/ aus",
        "ko": "UI가 빌드되지 않았습니다: web/에서 `npm run build`를 실행하세요",
    },
    # AI engines (ai.py)
    "ai_none": {
        "it": "Nessun motore AI collegato: in Preferenze → Motore AI trovi quelli supportati e come collegarli.",
        "en": "No AI engine connected: Preferences → AI engine lists the supported ones and how to connect them.",
        "de": "Keine KI verbunden: unter Einstellungen → KI findest du die unterstützten und wie du sie verbindest.",
        "ko": "연결된 AI 엔진이 없습니다: 환경설정 → AI 엔진에서 지원되는 엔진과 연결 방법을 확인하세요.",
    },
    "ai_unknown": {
        "it": "Motore AI sconosciuto",
        "en": "Unknown AI engine",
        "de": "Unbekannte KI",
        "ko": "알 수 없는 AI 엔진",
    },
    "ai_not_connected": {
        "it": "{name} non è collegato: esegui `{login}` in un terminale.",
        "en": "{name} isn't connected: run `{login}` in a terminal.",
        "de": "{name} ist nicht verbunden: führe `{login}` in einem Terminal aus.",
        "ko": "{name}이(가) 연결되어 있지 않습니다: 터미널에서 `{login}`을(를) 실행하세요.",
    },
    "ai_model_unknown": {
        "it": "Modello non disponibile per {name}",
        "en": "Model not available for {name}",
        "de": "Modell für {name} nicht verfügbar",
        "ko": "{name}에서 사용할 수 없는 모델",
    },
    "ai_failed": {
        "it": "{name} si è interrotto con un errore: {why}",
        "en": "{name} stopped with an error: {why}",
        "de": "{name} wurde mit einem Fehler beendet: {why}",
        "ko": "{name}이(가) 오류로 중단되었습니다: {why}",
    },
    "ai_timeout": {
        "it": "{name} non ha risposto entro {minutes} minuti.",
        "en": "{name} didn't answer within {minutes} minutes.",
        "de": "{name} hat nicht innerhalb von {minutes} Minuten geantwortet.",
        "ko": "{name}이(가) {minutes}분 안에 응답하지 않았습니다.",
    },
    "ai_invalid": {
        "it": "{name} ha restituito dati in un formato inatteso. Riprova, o scegli un altro modello.",
        "en": "{name} returned data in an unexpected shape. Try again, or pick another model.",
        "de": "{name} hat Daten in einem unerwarteten Format geliefert. Versuche es erneut oder wähle ein anderes Modell.",
        "ko": "{name}이(가) 예상과 다른 형식의 데이터를 반환했습니다. 다시 시도하거나 다른 모델을 선택하세요.",
    },
    # Profile import (profile.py)
    "import_busy": {
        "it": "Un'importazione è già in corso",
        "en": "An import is already running",
        "de": "Es läuft bereits ein Import",
        "ko": "이미 가져오기가 진행 중입니다",
    },
    "import_nothing": {
        "it": "Carica un file o incolla il testo del CV.",
        "en": "Upload a file or paste your CV's text.",
        "de": "Lade eine Datei hoch oder füge den Text deines Lebenslaufs ein.",
        "ko": "파일을 업로드하거나 이력서 텍스트를 붙여 넣으세요.",
    },
    "import_type": {
        "it": "Formato non supportato: carica un PDF, un file Markdown o di testo.",
        "en": "Unsupported format: upload a PDF, Markdown or text file.",
        "de": "Format nicht unterstützt: lade eine PDF-, Markdown- oder Textdatei hoch.",
        "ko": "지원하지 않는 형식입니다: PDF, Markdown 또는 텍스트 파일을 업로드하세요.",
    },
    "import_too_big": {
        "it": "Il file supera i {mb} MB.",
        "en": "The file is larger than {mb} MB.",
        "de": "Die Datei ist größer als {mb} MB.",
        "ko": "파일이 {mb}MB보다 큽니다.",
    },
    "import_unreadable": {
        "it": "Non riesco a leggere questo file: è danneggiato o protetto da password?",
        "en": "Can't read this file: is it damaged or password-protected?",
        "de": "Diese Datei lässt sich nicht lesen: ist sie beschädigt oder passwortgeschützt?",
        "ko": "이 파일을 읽을 수 없습니다: 손상되었거나 암호로 보호되어 있나요?",
    },
    "import_no_text": {
        "it": "Il PDF non contiene testo selezionabile, forse è una scansione: incolla il testo o carica un file Markdown.",
        "en": "The PDF has no selectable text, it may be a scan: paste the text or upload a Markdown file.",
        "de": "Die PDF enthält keinen markierbaren Text, vielleicht ein Scan: füge den Text ein oder lade eine Markdown-Datei hoch.",
        "ko": "PDF에 선택 가능한 텍스트가 없습니다. 스캔본일 수 있습니다: 텍스트를 붙여 넣거나 Markdown 파일을 업로드하세요.",
    },
    "import_too_short": {
        "it": "Il testo è troppo corto per essere un CV.",
        "en": "The text is too short to be a CV.",
        "de": "Der Text ist zu kurz für einen Lebenslauf.",
        "ko": "이력서라고 하기에는 텍스트가 너무 짧습니다.",
    },
    "import_too_long": {
        "it": "Il documento è troppo lungo per un CV ({n} caratteri, al massimo {max}).",
        "en": "The document is too long for a CV ({n} characters, at most {max}).",
        "de": "Das Dokument ist zu lang für einen Lebenslauf ({n} Zeichen, höchstens {max}).",
        "ko": "이력서라고 하기에는 문서가 너무 깁니다 ({n}자, 최대 {max}자).",
    },
    "import_interrupted": {
        "it": "Importazione interrotta: il server è stato riavviato.",
        "en": "Import interrupted: the server was restarted.",
        "de": "Import unterbrochen: der Server wurde neu gestartet.",
        "ko": "가져오기가 중단되었습니다: 서버가 다시 시작되었습니다.",
    },
    "evidence_missing": {
        "it": "Non ho trovato questo dato nel CV: controlla che sia giusto.",
        "en": "I couldn't find this in the CV: check that it's right.",
        "de": "Das habe ich im Lebenslauf nicht gefunden: prüfe, ob es stimmt.",
        "ko": "이력서에서 이 내용을 찾지 못했습니다: 맞는지 확인하세요.",
    },
    "draft_pending": {
        "it": "C'è una bozza del profilo da rivedere: confermala o scartala prima di importare un altro CV.",
        "en": "There's a profile draft to review: confirm or discard it before importing another CV.",
        "de": "Es gibt einen Profilentwurf zu prüfen: bestätige oder verwirf ihn, bevor du einen weiteren Lebenslauf importierst.",
        "ko": "검토할 프로필 초안이 있습니다: 다른 이력서를 가져오기 전에 확인하거나 버리세요.",
    },
    "draft_not_found": {
        "it": "Nessuna bozza del profilo da confermare",
        "en": "No profile draft to confirm",
        "de": "Kein Profilentwurf zum Bestätigen",
        "ko": "확인할 프로필 초안이 없습니다",
    },
    "cv_render_failed": {
        "it": "Questo stile non si riesce a compilare: scegline un altro.",
        "en": "This style can't be filled in: pick another one.",
        "de": "Dieser Stil lässt sich nicht ausfüllen: wähle einen anderen.",
        "ko": "이 스타일은 채울 수 없습니다: 다른 스타일을 선택하세요.",
    },
    # Profile review (review.py)
    "review_busy": {
        "it": "Una revisione del profilo è già in corso",
        "en": "A profile review is already running",
        "de": "Es läuft bereits eine Profilprüfung",
        "ko": "이미 프로필 검토가 진행 중입니다",
    },
    "review_nothing": {
        "it": "Non c'è ancora niente da rivedere: aggiungi un riepilogo o i punti di un'esperienza e salva.",
        "en": "Nothing to review yet: add a summary or an experience's bullets first.",
        "de": "Noch nichts zu prüfen: füge zuerst eine Zusammenfassung oder Punkte zu einer Erfahrung hinzu.",
        "ko": "아직 검토할 내용이 없습니다: 먼저 자기소개나 경력 항목을 추가하세요.",
    },
    "review_draft_pending": {
        "it": "Conferma o scarta prima la bozza importata dal CV.",
        "en": "Confirm or discard the draft imported from your CV first.",
        "de": "Bestätige oder verwirf zuerst den aus dem Lebenslauf importierten Entwurf.",
        "ko": "먼저 이력서에서 가져온 초안을 확인하거나 버리세요.",
    },
    "application_not_found": {
        "it": "Questa candidatura non esiste più.",
        "en": "This application no longer exists.",
        "de": "Diese Bewerbung gibt es nicht mehr.",
        "ko": "이 지원 내역은 더 이상 없습니다.",
    },
    "score_no_job": {
        "it": "Questa offerta non è tra quelle salvate.",
        "en": "This posting isn't among the saved ones.",
        "de": "Diese Stelle ist nicht unter den gespeicherten.",
        "ko": "저장된 채용공고가 아닙니다.",
    },
    "score_no_description": {
        "it": "L'annuncio non ha un testo da valutare.",
        "en": "The posting has no text to score.",
        "de": "Die Anzeige hat keinen Text zum Bewerten.",
        "ko": "평가할 공고 내용이 없습니다.",
    },
    "score_no_profile": {
        "it": "Serve un profilo salvato per valutare la compatibilità.",
        "en": "A saved profile is needed to score the fit.",
        "de": "Für die Bewertung wird ein gespeichertes Profil benötigt.",
        "ko": "적합도를 평가하려면 저장된 프로필이 필요합니다.",
    },
    "score_busy": {
        "it": "La valutazione di questa offerta è già in corso",
        "en": "This posting is already being scored",
        "de": "Diese Stelle wird bereits bewertet",
        "ko": "이 채용공고는 이미 평가 중입니다",
    },
    "score_busy_many": {
        "it": "Ci sono già tre valutazioni in corso: aspetta che una finisca.",
        "en": "Three scores are already running: wait for one to finish.",
        "de": "Es laufen bereits drei Bewertungen: warte, bis eine fertig ist.",
        "ko": "이미 세 건의 평가가 진행 중입니다. 하나가 끝날 때까지 기다리세요.",
    },
    "score_interrupted": {
        "it": "Valutazione interrotta: il server è stato riavviato.",
        "en": "Scoring interrupted: the server was restarted.",
        "de": "Bewertung unterbrochen: der Server wurde neu gestartet.",
        "ko": "평가가 중단되었습니다: 서버가 다시 시작되었습니다.",
    },
    # Tailored CVs (tailor.py, pdf.py)
    "cv_no_description": {
        "it": "L'annuncio non ha un testo su cui adattare il CV.",
        "en": "The posting has no text to tailor the CV to.",
        "de": "Die Anzeige hat keinen Text, auf den der Lebenslauf zugeschnitten werden kann.",
        "ko": "이력서를 맞출 공고 내용이 없습니다.",
    },
    "cv_no_profile": {
        "it": "Serve un profilo salvato per generare il CV.",
        "en": "A saved profile is needed to generate the CV.",
        "de": "Für den Lebenslauf wird ein gespeichertes Profil benötigt.",
        "ko": "이력서를 만들려면 저장된 프로필이 필요합니다.",
    },
    "cv_thin_profile": {
        "it": "Il profilo non ha ancora esperienze, riepilogo o progetti: aggiungine prima qualcuno.",
        "en": "The profile has no experience, summary or project yet: add some first.",
        "de": "Das Profil hat noch keine Erfahrung, Zusammenfassung oder Projekte: füge zuerst etwas hinzu.",
        "ko": "프로필에 아직 경력, 자기소개, 프로젝트가 없습니다. 먼저 추가하세요.",
    },
    "cv_busy": {
        "it": "Il CV per questa offerta è già in preparazione",
        "en": "The CV for this posting is already being written",
        "de": "Der Lebenslauf für diese Stelle wird bereits erstellt",
        "ko": "이 채용공고의 이력서를 이미 작성 중입니다",
    },
    "cv_busy_many": {
        "it": "Ci sono già tre CV in preparazione: aspetta che uno finisca.",
        "en": "Three CVs are already being written: wait for one to finish.",
        "de": "Es werden bereits drei Lebensläufe erstellt: warte, bis einer fertig ist.",
        "ko": "이미 세 건의 이력서를 작성 중입니다. 하나가 끝날 때까지 기다리세요.",
    },
    "cv_interrupted": {
        "it": "Generazione interrotta: il server è stato riavviato.",
        "en": "Generation interrupted: the server was restarted.",
        "de": "Erstellung unterbrochen: der Server wurde neu gestartet.",
        "ko": "작성이 중단되었습니다: 서버가 다시 시작되었습니다.",
    },
    "cv_not_found": {
        "it": "Non c'è ancora un CV pronto per questa offerta.",
        "en": "There's no finished CV for this posting yet.",
        "de": "Für diese Stelle gibt es noch keinen fertigen Lebenslauf.",
        "ko": "이 채용공고에 완성된 이력서가 아직 없습니다.",
    },
    "pdf_no_browser": {
        "it": "Per il PDF serve Chrome, Chromium o Edge su questo computer.",
        "en": "The PDF needs Chrome, Chromium or Edge on this computer.",
        "de": "Für das PDF wird Chrome, Chromium oder Edge auf diesem Computer benötigt.",
        "ko": "PDF를 만들려면 이 컴퓨터에 Chrome, Chromium 또는 Edge가 필요합니다.",
    },
    "pdf_failed": {
        "it": "Il PDF non si è potuto creare: {why}",
        "en": "The PDF couldn't be made: {why}",
        "de": "Das PDF konnte nicht erstellt werden: {why}",
        "ko": "PDF를 만들 수 없습니다: {why}",
    },
    "review_interrupted": {
        "it": "Revisione interrotta: il server è stato riavviato.",
        "en": "Review interrupted: the server was restarted.",
        "de": "Prüfung unterbrochen: der Server wurde neu gestartet.",
        "ko": "검토가 중단되었습니다: 서버가 다시 시작되었습니다.",
    },
    "suggestion_not_found": {
        "it": "Suggerimento non trovato: forse c'è una revisione più recente.",
        "en": "Suggestion not found: there may be a newer review.",
        "de": "Vorschlag nicht gefunden: vielleicht gibt es eine neuere Prüfung.",
        "ko": "제안을 찾을 수 없습니다: 더 최근의 검토가 있을 수 있습니다.",
    },
    # Opening a posting from a link (job_link.py)
    "link_unsupported": {
        "it": "Questo non è il link di un annuncio LinkedIn o Indeed.",
        "en": "This isn't a LinkedIn or Indeed job link.",
        "de": "Das ist kein Link zu einer Stelle auf LinkedIn oder Indeed.",
        "ko": "LinkedIn 또는 Indeed 채용공고 링크가 아닙니다.",
    },
    "link_paste_empty": {
        "it": "Servono almeno il titolo e il testo dell'annuncio.",
        "en": "A title and the posting's text are needed.",
        "de": "Titel und Text der Anzeige werden benötigt.",
        "ko": "제목과 공고 내용이 필요합니다.",
    },
    "link_unreadable": {
        "it": "Non riesco a leggere questo annuncio: potrebbe essere stato rimosso.",
        "en": "Can't read this posting: it may have been taken down.",
        "de": "Diese Stelle lässt sich nicht lesen: vielleicht wurde sie entfernt.",
        "ko": "이 채용공고를 읽을 수 없습니다: 삭제되었을 수 있습니다.",
    },
    "link_failed": {
        "it": "{site} non ha risposto: riprova tra poco.",
        "en": "{site} didn't answer: try again shortly.",
        "de": "{site} hat nicht geantwortet: versuche es gleich noch einmal.",
        "ko": "{site}이(가) 응답하지 않았습니다: 잠시 후 다시 시도하세요.",
    },
    "file_not_found": {
        "it": "File non trovato",
        "en": "File not found",
        "de": "Datei nicht gefunden",
        "ko": "파일을 찾을 수 없습니다",
    },
}


def _merge_extra() -> None:
    from .i18n_extra import EXTRA

    for lang, messages in EXTRA.items():
        for key, text in messages.items():
            MESSAGES[key][lang] = text  # type: ignore[index]


_merge_extra()


def t(key: str, **params: object) -> str:
    """The message `key` in the current language, with `params` filled in."""
    return MESSAGES[key][LOCALE.get()].format(**params)


def parse_accept_language(header: str | None) -> Locale:
    """First supported language in an Accept-Language header ("en-GB,en;q=0.9" -> "en")."""
    for part in (header or "").split(","):
        tag = part.split(";")[0].strip().lower()[:2]
        if tag in LOCALES:
            return tag  # type: ignore[return-value]
    return DEFAULT
