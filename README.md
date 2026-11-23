# career-agent (POC)

Ricerca offerte su LinkedIn e Indeed tramite [JobSpy](https://github.com/speedyapply/JobSpy), con UI web
(React + shadcn/ui) e filtri componibili come una query SQL.

## Avvio

```bash
cd web && npm install && npm run build && cd ..   # compila la UI in src/career_agent/static
uv run career-agent                               # http://127.0.0.1:8000
HOST=0.0.0.0 uv run career-agent                  # visibile sulla rete locale (nessuna auth)
```

Sviluppo UI con hot reload: `uv run career-agent` in un terminale, `cd web && npm run dev` in un altro
(Vite su :5173, fa da proxy verso `/api`).

## Filtri

Lo stato vive nell'URL (nuqs), quindi una query si condivide copiando il link; la pagina si apre vuota.

| Filtro | Param URL | SQL | Semantica |
|---|---|---|---|
| Dove | `where=Zurigo:ch:2657896:Zurigo~onsite.hybrid\|*~remote` | `EXISTS hits.place IN (…) AND work_mode IN (…)` | blocchi in OR; dentro: luoghi OR, modalità OR, luoghi AND modalità |
| Titolo contiene | `title=python developer,data engineer` | `lower(title) LIKE …` | frasi in OR, parole della frase in AND |
| Stipendio | `salary=100&cur=EUR&nosalary=true` (CHF predefinito) | stipendio convertito in `cur` (cambi BCE) `>= 100000 [OR non indicato]` | — |
| Tipo di impiego | `jt=fulltime.parttime&jtnull=true` | `job_type LIKE '%,fulltime,%' OR … [OR non indicato]` | OR |
| Pubblicata | `posted=168` | `date_posted >= …` | — |
| Portale | `sites=linkedin` | `site IN (…)` | OR |
| Ricerca libera | `q=fastapi` | `LIKE` su titolo, azienda, descrizione | — |

Filtri diversi sono in AND.

La barra filtra solo le offerte già salvate (freccia o Invio). «Cerca nuove offerte», nella pagina dei risultati
(o «Esegui» su una ricerca salvata), espande gli stessi filtri in ricerche (portale × luogo ×
keyword) e le avvia subito, una alla volta con pause di 10–20 s; l'avanzamento compare nella pagina dei risultati, con una frase che dice cosa sta facendo
e il dettaglio di ogni ricerca espandibile.
Le ricerche identiche (portale, keyword, luogo, solo remoto, finestra di date) riuscite nelle ultime 6 ore vengono
saltate: i loro risultati sono già salvati. «Aggiorna comunque», nell'avviso «Già aggiornata», le rifà subito.
Al massimo 16 ricerche per volta.

### Come si evitano i blocchi

- **Indeed**: una richiesta restituisce fino a 50 offerte, descrizioni comprese.
- **LinkedIn**: una richiesta per la pagina della lista (10 offerte); la pagina di un'offerta (descrizione, tipo,
  stipendio) si apre solo se è nuova, nel paese giusto e con un titolo che corrisponde, con 1,5–4 s di pausa tra
  una e l'altra. Le offerte con un titolo diverso vengono scartate: la ricerca non le mostrerebbe comunque.
- **Budget**: al massimo 150 richieste a LinkedIn nelle ultime 24 ore (lista e pagine delle offerte); finito il
  budget, le ricerche LinkedIn vengono rimandate.
- **Freno**: al primo segnale di limitazione (HTTP 403/429/999, rimando al login, pagina vuota sospetta) il portale
  va in pausa per 45 minuti, anche se il server viene riavviato; le altre ricerche continuano.

«Aggiorna comunque» rispetta budget e pause come ogni altra ricerca.

## Autocompletamento città

Le città vengono da [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) (dati GeoNames, senza
chiave), tramite il backend (`/api/places`): nomi nella lingua della UI, in inglese per i portali. Il paese è quello
della città scelta. Al servizio arriva solo il testo digitato come possibile città; se non è raggiungibile la UI usa
un piccolo catalogo offline.

## Lingue

Interfaccia in italiano, inglese e tedesco (Preferenze, ⌘/Ctrl+,). La scelta resta nel browser; al primo avvio vale
la lingua del browser, se è una di queste, altrimenti l'italiano. I testi stanno in `web/src/locales/` (l'italiano è il
riferimento: le altre lingue devono avere le stesse chiavi, lo controllano TypeScript e i test). Il backend risponde
nella lingua della UI (`Accept-Language`) con i messaggi di `src/career_agent/i18n.py`.

## Profilo

Facoltativo: la ricerca funziona anche senza. Si compila a mano, una sezione alla volta, oppure si importa un CV
(PDF, Markdown, testo o testo incollato) che un'AI trasforma in una bozza da rivedere.

- **Motore AI**: l'app usa una CLI AI già installata e collegata sul computer (Claude Code o Codex), con
  l'abbonamento dell'utente: nessuna chiave da inserire. In Preferenze → Motore AI si vedono le CLI trovate,
  si sceglie la predefinita e il modello. Serve solo all'import del profilo.
- **Esecuzione isolata**: Claude Code gira senza strumenti (`--tools ""`), con `--safe-mode` (niente hook, plugin,
  MCP o CLAUDE.md) e senza salvare la sessione. Codex gira in sandbox `read-only` in una cartella temporanea
  vuota, senza la config dell'utente. Il CV è trattato come dati, non come istruzioni.
- **Bozza e conferma**: nulla entra nel profilo finché l'utente non conferma. Ogni esperienza, formazione,
  progetto e certificazione porta una citazione dal CV, controllata sul testo estratto: se non c'è (o non c'è
  l'azienda o la scuola), la voce è segnata «da verificare».
- **Dove sta**: nello stesso SQLite (`data/jobs.db`). `profile_revisions` ha una riga per ogni salvataggio
  (l'ultima è il profilo); `profile_drafts` le importazioni; `documents` i CV caricati, con il file originale in
  `data/documents/`; `profile_files` foto e allegati, in `data/profile-files/`. «Ricomincia da capo» cancella tutto.

## Limiti noti

- Profilo: i PDF scansionati (senza testo selezionabile) non si importano; un nuovo import sostituisce il profilo
  alla conferma (le versioni precedenti restano in `profile_revisions`). Il CV su misura per offerta è ancora un
  mock.

- L'esclusione per titolo (`Query.title_none`) è supportata dall'API ma per ora non è esposta nella UI.

- La modalità (in sede/ibrido/remoto) è dedotta dal testo: l'endpoint pubblico di LinkedIn ignora il filtro `f_WT`.
- Gli stipendi in altre valute sono convertiti con i cambi di riferimento BCE del giorno (o una tabella di riserva se
  la BCE non risponde); annunci in valute senza cambio contano come «stipendio non indicato».
- Indeed cerca solo dentro un paese: con «Ovunque» viene saltato.
