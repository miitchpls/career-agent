"""User-facing server messages in the UI's languages.

The UI sends its language as `Accept-Language` ("it", "en", "de"); a middleware puts it in
`LOCALE` for the request. A search runs in a background thread, which keeps the language
of the request that started it.
"""

from contextvars import ContextVar
from typing import Literal

Locale = Literal["it", "en", "de"]
LOCALES: tuple[Locale, ...] = ("it", "en", "de")
DEFAULT: Locale = "it"

LOCALE: ContextVar[Locale] = ContextVar("locale", default=DEFAULT)

MESSAGES: dict[str, dict[Locale, str]] = {
    # Planning a search (query.plan)
    "need_where": {
        "it": "Aggiungi almeno un filtro «Dove» per sapere dove cercare.",
        "en": "Add at least one “Where” filter so we know where to search.",
        "de": "Füge mindestens einen „Wo“-Filter hinzu, damit wir wissen, wo gesucht wird.",
    },
    "need_title": {
        "it": "Aggiungi almeno una keyword in «Titolo contiene»: è il termine di ricerca sui portali.",
        "en": "Add at least one keyword in “Title contains”: it's the term searched on the job boards.",
        "de": "Füge mindestens ein Stichwort bei „Titel enthält“ hinzu: es ist der Suchbegriff auf den Jobportalen.",
    },
    "too_many": {
        "it": "La query genera {n} ricerche: il massimo nella POC è {max}.",
        "en": "The query makes {n} searches: the maximum in the POC is {max}.",
        "de": "Die Suche ergibt {n} Einzelsuchen: das Maximum im POC ist {max}.",
    },
    "indeed_country": {
        "it": "Indeed cerca solo dentro un paese",
        "en": "Indeed only searches within one country",
        "de": "Indeed sucht nur innerhalb eines Landes",
    },
    "indeed_uncovered": {
        "it": "Indeed non copre {country}",
        "en": "Indeed doesn't cover {country}",
        "de": "Indeed deckt {country} nicht ab",
    },
    # Running it (scraper)
    "busy": {
        "it": "Una ricerca è già in corso",
        "en": "A search is already running",
        "de": "Es läuft bereits eine Suche",
    },
    "nothing_to_run": {
        "it": "Nessuna ricerca da eseguire con questi filtri.",
        "en": "No searches to run with these filters.",
        "de": "Mit diesen Filtern gibt es keine Suche auszuführen.",
    },
    "paused": {
        "it": "{site} ha limitato le richieste: in pausa fino alle {time}",
        "en": "{site} throttled the requests: paused until {time}",
        "de": "{site} hat die Anfragen begrenzt: pausiert bis {time}",
    },
    "budget": {
        "it": "raggiunto il limite di {n} richieste a {site} nelle ultime 24 ore: riprova più tardi",
        "en": "reached the limit of {n} requests to {site} in the last 24 hours: try again later",
        "de": "Limit von {n} Anfragen an {site} in den letzten 24 Stunden erreicht: versuche es später",
    },
    "throttled": {
        "it": "il portale ha limitato le richieste: riprova più tardi",
        "en": "the job board throttled the requests: try again later",
        "de": "das Jobportal hat die Anfragen begrenzt: versuche es später",
    },
    "timeout": {
        "it": "il portale non ha risposto in tempo",
        "en": "the job board didn't answer in time",
        "de": "das Jobportal hat nicht rechtzeitig geantwortet",
    },
    "board_error": {
        "it": "il portale ha restituito un errore",
        "en": "the job board returned an error",
        "de": "das Jobportal hat einen Fehler gemeldet",
    },
    "missed": {
        "it": "{n} non lette ({why}): riprovo alla prossima ricerca",
        "en": "{n} not read ({why}): retrying on the next search",
        "de": "{n} nicht gelesen ({why}): neuer Versuch bei der nächsten Suche",
    },
    "missed_budget": {
        "it": "limite giornaliero di richieste raggiunto",
        "en": "daily request limit reached",
        "de": "tägliches Anfragelimit erreicht",
    },
    "missed_page": {
        "it": "pagina dell'annuncio non leggibile",
        "en": "posting page not readable",
        "de": "Anzeigenseite nicht lesbar",
    },
    # API
    "saved_not_found": {
        "it": "Ricerca salvata non trovata",
        "en": "Saved search not found",
        "de": "Gespeicherte Suche nicht gefunden",
    },
    "ui_not_built": {
        "it": "UI non compilata: esegui `npm run build` in web/",
        "en": "UI not built: run `npm run build` in web/",
        "de": "UI nicht gebaut: führe `npm run build` in web/ aus",
    },
    # AI engines (ai.py)
    "ai_none": {
        "it": "Nessun motore AI collegato: installa Claude Code o Codex ed esegui l'accesso.",
        "en": "No AI engine connected: install Claude Code or Codex and sign in.",
        "de": "Keine KI verbunden: installiere Claude Code oder Codex und melde dich an.",
    },
    "ai_unknown": {
        "it": "Motore AI sconosciuto",
        "en": "Unknown AI engine",
        "de": "Unbekannte KI",
    },
    "ai_not_connected": {
        "it": "{name} non è collegato: esegui `{login}` in un terminale.",
        "en": "{name} isn't connected: run `{login}` in a terminal.",
        "de": "{name} ist nicht verbunden: führe `{login}` in einem Terminal aus.",
    },
    "ai_model_unknown": {
        "it": "Modello non disponibile per {name}",
        "en": "Model not available for {name}",
        "de": "Modell für {name} nicht verfügbar",
    },
    "ai_failed": {
        "it": "{name} non ha completato l'estrazione: {why}",
        "en": "{name} didn't finish the extraction: {why}",
        "de": "{name} hat die Extraktion nicht abgeschlossen: {why}",
    },
    "ai_timeout": {
        "it": "{name} non ha risposto entro {minutes} minuti.",
        "en": "{name} didn't answer within {minutes} minutes.",
        "de": "{name} hat nicht innerhalb von {minutes} Minuten geantwortet.",
    },
    "ai_invalid": {
        "it": "{name} ha restituito dati in un formato inatteso. Riprova, o scegli un altro modello.",
        "en": "{name} returned data in an unexpected shape. Try again, or pick another model.",
        "de": "{name} hat Daten in einem unerwarteten Format geliefert. Versuche es erneut oder wähle ein anderes Modell.",
    },
    # Profile import (profile.py)
    "import_busy": {
        "it": "Un'importazione è già in corso",
        "en": "An import is already running",
        "de": "Es läuft bereits ein Import",
    },
    "import_nothing": {
        "it": "Carica un file o incolla il testo del CV.",
        "en": "Upload a file or paste your CV's text.",
        "de": "Lade eine Datei hoch oder füge den Text deines Lebenslaufs ein.",
    },
    "import_type": {
        "it": "Formato non supportato: carica un PDF, un file Markdown o di testo.",
        "en": "Unsupported format: upload a PDF, Markdown or text file.",
        "de": "Format nicht unterstützt: lade eine PDF-, Markdown- oder Textdatei hoch.",
    },
    "import_too_big": {
        "it": "Il file supera i {mb} MB.",
        "en": "The file is larger than {mb} MB.",
        "de": "Die Datei ist größer als {mb} MB.",
    },
    "import_unreadable": {
        "it": "Non riesco a leggere questo file: è danneggiato o protetto da password?",
        "en": "Can't read this file: is it damaged or password-protected?",
        "de": "Diese Datei lässt sich nicht lesen: ist sie beschädigt oder passwortgeschützt?",
    },
    "import_no_text": {
        "it": "Il PDF non contiene testo selezionabile, forse è una scansione: incolla il testo o carica un file Markdown.",
        "en": "The PDF has no selectable text, it may be a scan: paste the text or upload a Markdown file.",
        "de": "Die PDF enthält keinen markierbaren Text, vielleicht ein Scan: füge den Text ein oder lade eine Markdown-Datei hoch.",
    },
    "import_too_short": {
        "it": "Il testo è troppo corto per essere un CV.",
        "en": "The text is too short to be a CV.",
        "de": "Der Text ist zu kurz für einen Lebenslauf.",
    },
    "import_too_long": {
        "it": "Il documento è troppo lungo per un CV ({n} caratteri, al massimo {max}).",
        "en": "The document is too long for a CV ({n} characters, at most {max}).",
        "de": "Das Dokument ist zu lang für einen Lebenslauf ({n} Zeichen, höchstens {max}).",
    },
    "import_interrupted": {
        "it": "Importazione interrotta: il server è stato riavviato.",
        "en": "Import interrupted: the server was restarted.",
        "de": "Import unterbrochen: der Server wurde neu gestartet.",
    },
    "evidence_missing": {
        "it": "Non ho trovato questo dato nel CV: controlla che sia giusto.",
        "en": "I couldn't find this in the CV: check that it's right.",
        "de": "Das habe ich im Lebenslauf nicht gefunden: prüfe, ob es stimmt.",
    },
    "draft_not_found": {
        "it": "Nessuna bozza del profilo da confermare",
        "en": "No profile draft to confirm",
        "de": "Kein Profilentwurf zum Bestätigen",
    },
    "file_not_found": {
        "it": "File non trovato",
        "en": "File not found",
        "de": "Datei nicht gefunden",
    },
}


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
