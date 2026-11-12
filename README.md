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
saltate: i loro risultati sono già salvati. Al massimo 16 ricerche per volta.

### Come si evitano i blocchi

- **Indeed**: una richiesta restituisce fino a 50 offerte, descrizioni comprese.
- **LinkedIn**: una richiesta per la pagina della lista (10 offerte); la pagina di un'offerta (descrizione, tipo,
  stipendio) si apre solo se è nuova, nel paese giusto e con un titolo che corrisponde, con 1,5–4 s di pausa tra
  una e l'altra. Le offerte con un titolo diverso vengono scartate: la ricerca non le mostrerebbe comunque.
- **Budget**: al massimo 150 richieste a LinkedIn nelle ultime 24 ore (lista e pagine delle offerte); finito il
  budget, le ricerche LinkedIn vengono rimandate.
- **Freno**: al primo segnale di limitazione (HTTP 403/429/999, rimando al login, pagina vuota sospetta) il portale
  va in pausa per 45 minuti, anche se il server viene riavviato; le altre ricerche continuano.

«Svuota cache» non azzera né il budget né le pause.

## Autocompletamento città

Le città vengono da [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) (dati GeoNames, senza
chiave), tramite il backend (`/api/places`): nomi in italiano per la UI, in inglese per i portali. Il paese è quello
della città scelta. Al servizio arriva solo il testo digitato come possibile città; se non è raggiungibile la UI usa
un piccolo catalogo offline.

## Limiti noti

- L'esclusione per titolo (`Query.title_none`) è supportata dall'API ma per ora non è esposta nella UI.

- La modalità (in sede/ibrido/remoto) è dedotta dal testo: l'endpoint pubblico di LinkedIn ignora il filtro `f_WT`.
- Gli stipendi in altre valute sono convertiti con i cambi di riferimento BCE del giorno (o una tabella di riserva se
  la BCE non risponde); annunci in valute senza cambio contano come «stipendio non indicato».
- Indeed cerca solo dentro un paese: con «Ovunque» viene saltato.
