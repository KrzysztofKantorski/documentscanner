# DocumentScanner – frontend

Ekran aplikowania na ofertę: dane kontaktowe, wgranie CV w PDF (przeciągnij i upuść albo wybór z dysku), zgoda na przetwarzanie danych i wysyłka do backendu z paskiem postępu.

## Uruchomienie

```sh
npm install
cp .env.example .env.local   # opcjonalnie, patrz niżej
npm run dev
```

| Skrypt          | Co robi                          |
| --------------- | -------------------------------- |
| `npm run dev`   | serwer deweloperski Vite         |
| `npm test`      | testy (Vitest + Testing Library) |
| `npm run lint`  | ESLint                           |
| `npm run build` | sprawdzenie typów i build        |

## Konfiguracja

| Zmienna          | Domyślnie | Opis |
| ---------------- | --------- | ---- |
| `VITE_API_URL`   | pusta     | Adres backendu, np. `https://api.example.com`. Gdy pusta, formularz działa w trybie demo: wysyłka jest symulowana i plik nie opuszcza przeglądarki. |
| `VITE_MAX_CV_MB` | `4`       | Największy przyjmowany plik w MB. 4 MB to limit planu F0 w Azure AI Document Intelligence. Na płatnym planie S0 można podnieść. |
| `VITE_PRIVACY_POLICY_URL` | pusta | Link do klauzuli informacyjnej RODO (art. 13), pokazywany przy zgodzie. Gdy pusty, linku nie ma. |

Zmienne `VITE_*` trafiają do kodu w przeglądarce, więc nie wolno w nich trzymać kluczy ani sekretów.

## Kontrakt API

Formularz wysyła jedno żądanie:

```
POST {VITE_API_URL}/api/applications
Content-Type: multipart/form-data
```

| Pole         | Typ      | Wymagane | Uwagi |
| ------------ | -------- | -------- | ----- |
| `offerId`    | tekst    | tak      | identyfikator oferty |
| `fullName`   | tekst    | tak      | 3–100 znaków |
| `email`      | tekst    | tak      | do 254 znaków |
| `phone`      | tekst    | nie      | pomijane, gdy puste |
| `profileUrl` | tekst    | nie      | tylko `http://` lub `https://`, pomijane, gdy puste |
| `consent`    | `"true"` | tak      | zgoda na przetwarzanie CV |
| `cv`         | plik     | tak      | jeden PDF, do `VITE_MAX_CV_MB` |

Odpowiedź po sukcesie (`2xx`):

```json
{ "applicationId": "a1b2c3" }
```

`applicationId` to niepusty tekst o długości do 128 znaków. Inna odpowiedź jest traktowana jako błąd.

Jeśli backend odrzuci konkretne pola, może odpowiedzieć tak jak domyślnie robi to ASP.NET Core (`ValidationProblemDetails`):

```json
{ "title": "One or more validation errors occurred.", "errors": { "Email": ["Ten adres już aplikował."] } }
```

Formularz dopasowuje klucze do pól (`fullName`, `email`, `phone`, `profileUrl`, `cv`, `consent`) bez względu na wielkość liter i znaki takie jak `$.`, pokazuje komunikat przy polu i przenosi na nie fokus. Nieznane klucze pomija.

Kody błędów, które formularz tłumaczy na komunikaty dla użytkownika: `400`, `413`, `415`, `422`, `429` i `5xx`. Pozostałe kody pokazują ogólny komunikat z numerem kodu.

### Co musi sprawdzić backend

Walidacja w przeglądarce służy tylko wygodzie użytkownika i łatwo ją obejść. Backend powinien sam:

- sprawdzić, że plik zaczyna się od `%PDF-`, i odrzucić go z `415`, jeśli nie;
- odrzucić zbyt duży plik z `413`;
- przyjąć `profileUrl` tylko ze schematem `http` lub `https`, zanim rekruter zobaczy go jako link;
- odrzucić żądanie bez `consent=true`;
- pozwolić w CORS tylko na adres frontendu;
- nie logować treści CV ani danych osobowych.

## Hosting i nagłówki bezpieczeństwa

Frontend trafia na Azure Static Web Apps (`infrastructure/main.tf`). Plik `public/staticwebapp.config.json` ustawia:

- `Content-Security-Policy`: skrypty, style i obrazy tylko z własnej domeny, połączenia i wysyłka formularza tylko do backendu `documentscanner-backend-prod.azurewebsites.net`, zakaz osadzania w ramkach i wymuszone Trusted Types;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` i `Cross-Origin-Opener-Policy`;
- przekierowanie nieznanych ścieżek na `index.html`, na wypadek gdyby aplikacja dostała routing.

Jeśli zmieni się adres backendu, trzeba go poprawić w `connect-src` i `form-action`, bo inaczej przeglądarka zablokuje wysyłkę.

## Struktura

```
src/features/cv-upload/
  CvUploadForm.tsx   formularz i stany: edycja, wysyłanie, błąd, sukces
  CvDropzone.tsx     strefa upuszczania pliku
  api.ts             wysyłka przez XHR (postęp, anulowanie) i tryb demo
  validation.ts      walidacja pól i pliku PDF
```

`CvUploadForm` przyjmuje `offer` (wybraną ofertę) i opcjonalnie `onSubmitted`, który dostaje `{ applicationId, demo }` po udanej wysyłce. Przez ten callback można przejść do widoku analizy.
