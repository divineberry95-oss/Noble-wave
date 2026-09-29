# NOBLE WAVE — Stage 5 Production Foundation

**Music Without Borders.**

Stage 4 upgrades the Stage 3 Supabase-connected app into a more complete music discovery experience.

## Included

- Supabase email/password authentication
- Published music catalogue
- Secure signed audio URLs
- Secure signed cover-art URLs
- Full-size artwork in catalogue cards and player
- Artist public profiles
- Artist follow/unfollow system
- Follower counters maintained by database triggers
- Artist profile editing: stage name, bio and avatar URL
- Track likes/unlikes stored in Supabase
- Like counters maintained by database triggers
- Liked Songs library
- Personal playlists stored in Supabase
- Create/delete playlists
- Add/remove tracks from playlists
- Genre discovery
- Trending/popular sections
- Search
- Previous / play / next player controls
- Stream recording through the existing secure Edge Function
- Track play-count trigger from validated stream events
- Artist upload → draft → review → publish workflow
- Admin publishing console
- Royalty periods and server-side royalty calculation foundation
- Responsive mobile interface
- PWA install prompt hook

## Supabase project

The frontend is configured for the NOBLE WAVE Supabase project. The browser uses only the publishable key. Never put a Supabase secret/service-role key in this frontend.

## Admin setup

Create an account first. Then, in Supabase SQL Editor, promote the intended admin account:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'YOUR-ADMIN-EMAIL'
);
```

## Stage 4 database additions

The database now contains:

- `artist_follows`
- `track_likes`
- `playlists`
- `playlist_tracks`
- `artists.follower_count`
- `tracks.like_count`

RLS is enabled on the new tables. Users can only manage their own follows, likes and playlists. Counter fields are maintained server-side by database triggers.

## Important production note

This is still a functional web-app foundation, not a production-scale global streaming service. A public launch still needs music licensing and rights agreements, copyright/takedown workflows, stronger anti-fraud and stream validation, scalable audio/CDN delivery, moderation, payout/KYC/tax infrastructure, privacy/security review, analytics, backups and operational monitoring.

## Run locally

Serve this folder from a local web server rather than opening `index.html` directly. For example:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```


## Stage 5 additions

- Personalized recommendations based on followed artists and liked-song genres
- Artist royalty payout-request workflow through a protected Edge Function
- Rights declarations for master/composition ownership
- Admin rights verification workflow
- Copyright/takedown report submission and admin review workflow
- Stream validation status and fraud score fields
- Server-side stream recording now uses the Supabase service role only inside the Edge Function, while the browser never receives that secret
- Royalty calculation now uses only validated streams and tracks with verified rights declarations
- Idempotent royalty-period recalculation foundation
- PWA manifest and service-worker shell caching

## Production limitations still requiring external infrastructure

NOBLE WAVE is now a stronger production foundation, but a public global launch still requires signed commercial music licences/rights agreements, legal terms and privacy policies, professional content moderation, stronger anti-fraud/device/network detection, audio transcoding and adaptive streaming infrastructure for scale, payment-provider onboarding and KYC/tax workflows, operational monitoring/alerts, backups/disaster recovery, abuse prevention, regional compliance, and a real payment provider connection. The payout request flow records and validates requests; it does not itself transfer money.

Never put a Supabase service-role key, payment secret, webhook secret, or other private credential in the browser bundle.


## Berryd music deployment
This rebuild includes five playable Berryd tracks under `music/` and loads them directly into the catalogue as built-in tracks. No Supabase track row is required for these five tracks to appear.

Included: BNW Lakers ft. Berryd — Love of a Thugger; Berryd — Tension; Berryd — Best; Berryd — Introduction; Berryd — Stressed Up. `VoiceAudio_3` is intentionally excluded.

### iPhone/Vercel
Upload the entire extracted folder to Vercel (or connect the folder to the existing project). Do not upload only `index.html`. The `music/` folder must stay beside `index.html`. After deployment, open the new deployment URL and refresh once.

Supabase remains connected for accounts, social features, artist uploads, royalties, rights, moderation, and the cloud catalogue. Supabase Storage is still the right place for future uploaded tracks and private/signed media.
