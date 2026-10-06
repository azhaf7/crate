// Crate settings. Everything here is public by design; never put a secret in this file.
// - Supabase: the project URL and its anon (publishable) key. The database only accepts what
//   supabase/schema.sql allows, so this key can't read anyone else's records.
// - Spotify Client ID (optional): it's in every Spotify web app. Never put the Client Secret here.
window.CRATE = {
  supabaseUrl: 'https://fnnpicvcvonmnwkijlwc.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubnBpY3Zjdm9ubW53a2lqbHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg5ODcsImV4cCI6MjEwNjgwNDk4N30.i0OO9XU6A9lyZjpqekJHFkabD7fdylDqef5YecDVzBk',
  spotifyClientId: '',
};
