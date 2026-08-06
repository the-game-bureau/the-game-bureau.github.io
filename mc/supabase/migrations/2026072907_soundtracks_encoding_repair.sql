-- Repair the double-encoded text left by the first run of
-- 2026072905_soundtracks_seed.sql.
--
-- What happened: the seed SQL was generated from sound/soundtracks.json by a
-- script that opened the file without specifying an encoding. On Windows that
-- means cp1252, so each UTF-8 byte pair was decoded as two separate characters
-- and then written back out as UTF-8 — the classic double-encoding. 'Tiesto'
-- with a diaeresis went in as two characters where one belonged, and so did 91
-- other fields across 24 cities: Amsterdam, Antalya, Athens, Madrid,
-- Mexico City, Munich, New Orleans, Paris, Rio de Janeiro, Saint-Denis and the
-- rest with accented artist names or Spanish, Turkish, Portuguese and German
-- titles.
--
-- The values below are read straight from the (correct, UTF-8) JSON file and
-- keyed on (city_slug, position), which the seed set from the file's own array
-- order and nothing has changed since. Each UPDATE is explicit rather than an
-- encoding round-trip like convert_from(convert_to(col,'WIN1252'),'UTF8'): the
-- round-trip happens to be exactly right for all 92 fields, but it would also
-- silently corrupt any correctly-stored accent added later, and an explicit list
-- cannot touch a row it does not name.
--
-- Safe to re-run: every UPDATE is idempotent. Do NOT re-run the old seed to fix
-- this — a corrected title is a different value under the
-- (city_slug, lower(title), lower(artist)) unique index, so it would insert a
-- second copy of the song rather than mend the first.
update public.soundtrack_songs set artist = 'Tiësto'
 where city_slug = 'amsterdam' and position = 10;
update public.soundtrack_songs set title = 'Antalya''ya Koş'
 where city_slug = 'antalya' and position = 1;
update public.soundtrack_songs set artist = 'Levent Yüksel', blurb = 'Antalya-born Yüksel''s 1993 album that reset Turkish pop'
 where city_slug = 'antalya' and position = 3;
update public.soundtrack_songs set artist = 'Levent Yüksel'
 where city_slug = 'antalya' and position = 4;
update public.soundtrack_songs set title = 'Antalyaspor''un Marşı'
 where city_slug = 'antalya' and position = 5;
update public.soundtrack_songs set artist = 'Stüdyo10Bir, EkoFlow, Nefboii', title = 'Kırmızı Şimşekler'
 where city_slug = 'antalya' and position = 6;
update public.soundtrack_songs set artist = 'Gülay Diri', blurb = 'Folk song for the purple grapes of İbradı', title = 'Antalya''nın Mor Üzümü'
 where city_slug = 'antalya' and position = 9;
update public.soundtrack_songs set artist = 'Bedia Akartürk', blurb = 'Yörük migration song collected in Serik, outside Antalya', title = 'Çekemedim Akça Kızın Göçünü'
 where city_slug = 'antalya' and position = 10;
update public.soundtrack_songs set artist = 'Ziya Özbay', title = 'Teke Zortlatması'
 where city_slug = 'antalya' and position = 11;
update public.soundtrack_songs set artist = 'Şaban Çatallar', title = 'Antalya Korkuteli Arası'
 where city_slug = 'antalya' and position = 12;
update public.soundtrack_songs set artist = 'Yeni Türkü'
 where city_slug = 'antalya' and position = 13;
update public.soundtrack_songs set artist = 'Ali Kocatepe, Hümeyra, Esin Engin, Bora Ayanoğlu', title = 'Akdeniz Şarkısı'
 where city_slug = 'antalya' and position = 14;
update public.soundtrack_songs set blurb = 'Southern railroad reverie from Athens’s most famous sons'
 where city_slug = 'athens' and position = 1;
update public.soundtrack_songs set blurb = 'Elephant 6 founders, Athens’s inventive home-recording pop lab'
 where city_slug = 'athens' and position = 8;
update public.soundtrack_songs set blurb = 'Athens’s Elephant 6 collective at its most beloved'
 where city_slug = 'athens' and position = 9;
update public.soundtrack_songs set blurb = 'Elephant 6 psych-pop from Kevin Barnes’s Athens'
 where city_slug = 'athens' and position = 10;
update public.soundtrack_songs set artist = 'Rudy Vallée'
 where city_slug = 'augusta' and position = 0;
update public.soundtrack_songs set blurb = 'Simone’s soulful lament for the harbor city'
 where city_slug = 'baltimore' and position = 0;
update public.soundtrack_songs set blurb = 'Harold Arlen, born on Buffalo’s East Side, wrote it'
 where city_slug = 'buffalo' and position = 12;
update public.soundtrack_songs set artist = 'Flaco Jiménez'
 where city_slug = 'corpus-christi' and position = 5;
update public.soundtrack_songs set title = 'No Te Olvidaré'
 where city_slug = 'corpus-christi' and position = 10;
update public.soundtrack_songs set blurb = 'KISS’s roaring ode to the Motor City'
 where city_slug = 'detroit' and position = 10;
update public.soundtrack_songs set blurb = 'Detroit garage-rock duo’s stadium-stomping riff'
 where city_slug = 'detroit' and position = 11;
update public.soundtrack_songs set blurb = 'The lyric’s south Detroit never actually existed'
 where city_slug = 'detroit' and position = 13;
update public.soundtrack_songs set blurb = 'Detroit techno’s founding record, still the blueprint'
 where city_slug = 'detroit' and position = 14;
update public.soundtrack_songs set artist = 'Beyoncé'
 where city_slug = 'houston' and position = 1;
update public.soundtrack_songs set artist = 'Janelle Monáe'
 where city_slug = 'kansas-city' and position = 5;
update public.soundtrack_songs set artist = 'Joaquín Sabina'
 where city_slug = 'madrid' and position = 0;
update public.soundtrack_songs set title = 'A Quién Le Importa'
 where city_slug = 'madrid' and position = 2;
update public.soundtrack_songs set blurb = 'Definitive Movida madrileña classic'
 where city_slug = 'madrid' and position = 3;
update public.soundtrack_songs set blurb = 'Real Madrid''s Bernabéu club anthem', title = 'Hala Madrid y Nada Más'
 where city_slug = 'madrid' and position = 4;
update public.soundtrack_songs set title = 'Déjame'
 where city_slug = 'madrid' and position = 6;
update public.soundtrack_songs set artist = 'Rosalía'
 where city_slug = 'madrid' and position = 7;
update public.soundtrack_songs set title = 'Y Viva España'
 where city_slug = 'madrid' and position = 9;
update public.soundtrack_songs set artist = 'Ana Belén', title = 'La Puerta de Alcalá'
 where city_slug = 'madrid' and position = 11;
update public.soundtrack_songs set artist = 'Café Tacvba'
 where city_slug = 'mexico-city' and position = 0;
update public.soundtrack_songs set artist = 'Café Tacvba'
 where city_slug = 'mexico-city' and position = 1;
update public.soundtrack_songs set title = 'Sábado Distrito Federal'
 where city_slug = 'mexico-city' and position = 2;
update public.soundtrack_songs set title = 'La Célula Que Explota'
 where city_slug = 'mexico-city' and position = 4;
update public.soundtrack_songs set artist = 'Zoé'
 where city_slug = 'mexico-city' and position = 6;
update public.soundtrack_songs set artist = 'José José', blurb = 'The Prince of Song, born in Clavería'
 where city_slug = 'mexico-city' and position = 8;
update public.soundtrack_songs set title = 'Hasta la Raíz'
 where city_slug = 'mexico-city' and position = 9;
update public.soundtrack_songs set artist = 'Vicente Fernández', title = 'México Lindo y Querido'
 where city_slug = 'mexico-city' and position = 10;
update public.soundtrack_songs set artist = 'José Alfredo Jiménez'
 where city_slug = 'mexico-city' and position = 11;
update public.soundtrack_songs set artist = 'Exposé'
 where city_slug = 'miami' and position = 22;
update public.soundtrack_songs set artist = 'Eric Benét'
 where city_slug = 'milwaukee' and position = 3;
update public.soundtrack_songs set artist = 'Hüsker Dü'
 where city_slug = 'minneapolis' and position = 3;
update public.soundtrack_songs set blurb = 'Minneapolis alt-country heroes’ aching signature ballad'
 where city_slug = 'minneapolis' and position = 8;
update public.soundtrack_songs set title = 'Stern des Südens'
 where city_slug = 'munich' and position = 2;
update public.soundtrack_songs set artist = 'Münchener Freiheit'
 where city_slug = 'munich' and position = 3;
update public.soundtrack_songs set blurb = 'Treme native’s modern brass-funk firestorm'
 where city_slug = 'new-orleans' and position = 12;
update public.soundtrack_songs set title = 'It’s Raining'
 where city_slug = 'new-orleans' and position = 14;
update public.soundtrack_songs set artist = 'Édith Piaf'
 where city_slug = 'paris' and position = 0;
update public.soundtrack_songs set title = 'La Bohème'
 where city_slug = 'paris' and position = 1;
update public.soundtrack_songs set title = 'Les Champs-Élysées'
 where city_slug = 'paris' and position = 2;
update public.soundtrack_songs set artist = 'Édith Piaf'
 where city_slug = 'paris' and position = 3;
update public.soundtrack_songs set title = 'Il est cinq heures, Paris s''éveille'
 where city_slug = 'paris' and position = 6;
update public.soundtrack_songs set artist = 'Aminé'
 where city_slug = 'portland' and position = 10;
update public.soundtrack_songs set blurb = 'Richmond Celtic-rock mainstays’ anthem, born in local clubs'
 where city_slug = 'richmond' and position = 4;
update public.soundtrack_songs set blurb = 'Richmond’s monstrous shock-metal legends, hatched at VCU art school'
 where city_slug = 'richmond' and position = 6;
update public.soundtrack_songs set artist = 'Antônio Carlos Jobim'
 where city_slug = 'rio-de-janeiro' and position = 0;
update public.soundtrack_songs set artist = 'João Gilberto'
 where city_slug = 'rio-de-janeiro' and position = 2;
update public.soundtrack_songs set title = 'Aquele Abraço'
 where city_slug = 'rio-de-janeiro' and position = 3;
update public.soundtrack_songs set title = 'As Rosas Não Falam'
 where city_slug = 'rio-de-janeiro' and position = 4;
update public.soundtrack_songs set title = 'Você'
 where city_slug = 'rio-de-janeiro' and position = 5;
update public.soundtrack_songs set artist = 'Vinícius de Moraes', title = 'Samba da Bênção'
 where city_slug = 'rio-de-janeiro' and position = 8;
update public.soundtrack_songs set artist = 'Suprême NTM', title = 'Laisse Pas Traîner Ton Fils'
 where city_slug = 'saint-denis' and position = 1;
update public.soundtrack_songs set title = 'Désolé'
 where city_slug = 'saint-denis' and position = 4;
update public.soundtrack_songs set title = 'Bouge de Là'
 where city_slug = 'saint-denis' and position = 5;
update public.soundtrack_songs set artist = 'Maître Gims'
 where city_slug = 'saint-denis' and position = 7;
update public.soundtrack_songs set artist = 'Suprême NTM'
 where city_slug = 'saint-denis' and position = 9;
update public.soundtrack_songs set artist = 'Flaco Jiménez'
 where city_slug = 'san-antonio' and position = 3;
update public.soundtrack_songs set title = 'Como Le Haré'
 where city_slug = 'san-antonio' and position = 5;
update public.soundtrack_songs set title = 'Hey Baby ¡Qué Paso!'
 where city_slug = 'san-antonio' and position = 6;
update public.soundtrack_songs set artist = 'Santiago Jiménez Jr.'
 where city_slug = 'san-antonio' and position = 9;
update public.soundtrack_songs set blurb = 'Norteño legends built their empire in San Jose'
 where city_slug = 'san-jose' and position = 3;
update public.soundtrack_songs set blurb = 'San Jose''s norteño giants telling immigrant stories'
 where city_slug = 'san-jose' and position = 9;
