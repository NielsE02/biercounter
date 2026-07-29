

# Biercounter

Mobiele website voor een besloten vakantiegroep.

## Functies

- Beheerder logt in met e-mail en wachtwoord.
- Alleen de beheerder kan spelers toevoegen of verbergen.
- Spelers kiezen hun naam zonder zichtbaar account.
- Supabase maakt stil een anonieme sessie per browser.
- Spelers kunnen drankjes toevoegen.
- Spelers kunnen alleen invoer verwijderen die vanaf hun eigen browsersessie is gemaakt.
- De beheerder kan alle invoer verwijderen.
- Het klassement werkt live bij.

## Bestanden

- `index.html`, pagina-opbouw.
- `styles.css`, mobiele vormgeving.
- `app.js`, werking van de website.
- `config.js`, Supabase projectgegevens.
- `supabase-setup.sql`, database en beveiligingsregels.
- `.nojekyll`, voorkomt verwerking door Jekyll.

## Stap 1. Supabase-project maken

1. Maak een gratis account op Supabase.
2. Kies `New project`.
3. Vul een projectnaam en een sterk databasewachtwoord in.
4. Kies een Europese regio.
5. Wacht tot het project klaar is.

## Stap 2. Database maken

1. Open links `SQL Editor`.
2. Kies `New query`.
3. Open lokaal het bestand `supabase-setup.sql`.
4. Kopieer alles naar de SQL Editor.
5. Kies `Run`.

## Stap 3. Anonieme toegang aanzetten

1. Open `Authentication`.
2. Open `Providers` of `Sign In / Providers`.
3. Zoek `Anonymous`.
4. Zet `Allow anonymous sign-ins` aan.
5. Sla de wijziging op.

## Stap 4. Beheerdersaccount maken

1. Open `Authentication`.
2. Open `Users`.
3. Kies `Add user`.
4. Kies `Create new user`.
5. Vul jouw e-mailadres en een sterk wachtwoord in.
6. Zet e-mail direct bevestigd aan als die optie zichtbaar is.
7. Maak de gebruiker.
8. Kopieer de UUID van de nieuwe gebruiker.
9. Open `SQL Editor`.
10. Voer dit uit, met jouw echte UUID:

```sql
insert into public.admins (user_id)
values ('JOUW-GEBRUIKER-UUID');
```

## Stap 5. Projectgegevens in config.js zetten

1. Open in Supabase `Project Settings`.
2. Open `API Keys` of `Data API`.
3. Kopieer de `Project URL`.
4. Kopieer de `Publishable key`. Een oudere Supabase-versie kan dit `anon public` noemen.
5. Open `config.js`.
6. Vervang beide voorbeeldwaarden.

Voorbeeld:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_KEY: "sb_publishable_..."
};
```

Gebruik nooit een secret key of service_role key in deze website.

## Stap 6. GitHub-repository maken

1. Maak een GitHub-account.
2. Kies `New repository`.
3. Geef de repository een lastig te raden naam.
4. Kies voor GitHub Pages op een gratis account een openbare repository.
5. Upload alle bestanden uit deze map naar de hoofdmap van de repository.
6. Commit de bestanden.

## Stap 7. GitHub Pages aanzetten

1. Open de repository.
2. Open `Settings`.
3. Kies links `Pages`.
4. Kies bij `Source` de optie `Deploy from a branch`.
5. Kies branch `main`.
6. Kies map `/(root)`.
7. Kies `Save`.
8. GitHub toont daarna het webadres.

Het adres lijkt op:

`https://jouwnaam.github.io/naam-van-repository/`

## Stap 8. Testen

1. Open het webadres.
2. Kies rechtsboven `Beheer`.
3. Log in met jouw beheerdersaccount.
4. Voeg twee testspelers toe.
5. Log uit.
6. Kies een speler.
7. Voeg een drankje toe.
8. Open de website op een tweede telefoon.
9. Kies de andere speler.
10. Controleer of het klassement live bijwerkt.
11. Verwijder een eigen invoer.
12. Controleer dat je de invoer van de andere telefoon niet kunt verwijderen.

## Belangrijke beperking

De webpagina heeft geen groepswachtwoord. Iedereen met de URL kan spelers kiezen en invoer toevoegen. De database voorkomt wel dat gewone spelers spelers beheren, alle scores wissen of invoer van andere browsers verwijderen.

De selectie van een speler is gebaseerd op vertrouwen. Iemand uit de groep kan dus bewust de naam van een ander kiezen.

## Aanpassen

Je kunt de soorten drankjes aanpassen in twee plaatsen:

1. In `app.js`, bij `DRINK_TYPES`.
2. In `supabase-setup.sql`, bij de controle op `drink_type`.

Heb je de database al gemaakt, pas dan ook de controle in Supabase aan voordat je een nieuw type gebruikt.

## Privacy

Gebruik alleen voornamen of bijnamen. Deel de URL niet buiten de groep. Zet geen gevoelige informatie in de database.
