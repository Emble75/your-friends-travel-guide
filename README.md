# Turi: Your Friends' Travel Guide

Baue eine Social-Travel-App namens "Turi" – eine Mischung aus Instagram und Google Maps Reviews.

KONZEPT:

Nutzer folgen Freunden über Accounts. Für jeden besuchten Ort können sie eine 

Bewertung (Text, Sternerating, bis zu 3 Fotos) hinterlassen. Das Kernfeature: 

Wenn man einen Ort ansieht, sieht man NUR die Bewertungen von Freunden, denen 

man folgt – nicht von Fremden. So sieht man sofort, wer aus dem eigenen Kreis 

schon dort war, statt einzeln nachfragen zu müssen.

BRANDING:

- App-Name: Turi

- Primärfarbe: Orange (#FF6B35 oder ähnlich kräftiges Orange)

- Logo/Icon: großes, cooles weißes "T" auf orangem Hintergrund

- Modernes, cleanes UI im Stil von Instagram/Airbnb, viel Weißraum, abgerundete Karten

KERNFUNKTIONEN (MVP):

1. Auth: Registrierung/Login (E-Mail)

2. Profil: Username, Avatar, eigene Bewertungen als Liste/Grid

3. Freunde: Nutzer suchen und folgen/entfolgen können

4. Orte: Suchfeld für Orte (Name, Stadt) – Ort anlegen falls noch nicht vorhanden

5. Bewertung erstellen: Ort auswählen, Sterne (1-5), Text, bis zu 3 Bilder hochladen

6. Ortsansicht: zeigt NUR Bewertungen von Personen, denen der aktuelle Nutzer folgt 

   (klar erkennbar mit Avatar + Name), plus Durchschnittsrating dieser Freunde

7. Feed: chronologische Übersicht der neuesten Bewertungen von gefolgten Freunden

DATENMODELL (für Supabase-Integration):

- users (id, username, avatar_url)

- follows (follower_id, following_id)

- places (id, name, city, category)

- reviews (id, user_id, place_id, rating, text, created_at)

- review_images (id, review_id, image_url)

WICHTIG:

- Mobile-first Design, da später als App verpackt wird

- Leerer-Zustand gut gestalten: "Noch keine Freunde-Bewertungen für diesen Ort" 

  statt einer leeren weißen Fläche

- Bitte mit Supabase als Backend verbinden (Auth + Datenbank + Storage für Bilder)

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/76fa699a-f1d6-428e-b481-a823e4a7a5d7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
