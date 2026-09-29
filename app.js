const SUPABASE_URL = "https://kprhrcdmrrgbaqsyvopt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Z3wrQuhNMtnXIP_WPOqzpA_0T_A3rSf";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let songs = [], artists = [], playlists = [];
let likedSongIds = new Set(), followedArtistIds = new Set();
let account = null, authMode = "login", currentPage = "home", currentIndex = 0, currentSong = null;
let viewArtistId = null, viewPlaylistId = null, deferredPrompt = null;
const audio = $("#audio"), streamRecorded = new Set();

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmt(s){s=Math.floor(s||0);return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`}
function toast(message, ok=true){const el=$("#globalMsg");if(!el)return;el.innerHTML=`<div class="notice toast ${ok?'':'error'}">${esc(message)}</div>`;setTimeout(()=>el.innerHTML="",4200)}
function coverStyle(url){return url?`style="background-image:url('${esc(url)}');background-size:cover;background-position:center"`:""}
function empty(msg){return `<div class="notice">${esc(msg)}</div>`}

async function loadAccount(user){
  if(!user){account=null;return;}
  const {data:profile}=await sb.from("profiles").select("id,display_name,username,avatar_url,role").eq("id",user.id).maybeSingle();
  account={id:user.id,email:user.email,display_name:profile?.display_name||user.email?.split("@")[0]||"Listener",role:profile?.role||"listener",avatar_url:profile?.avatar_url||null};
}

async function ensureArtistProfile(){
  if(!account?.id)return false;
  const {data:artist}=await sb.from("artists").select("id,stage_name").eq("id",account.id).maybeSingle();
  if(artist){if(account.role!=="admin")account.role="artist";return true;}
  const stage=(account.display_name||account.email?.split("@")[0]||"Artist").trim();
  const {error:pErr}=await sb.from("profiles").update({display_name:stage,role:"artist"}).eq("id",account.id);
  if(pErr){toast(pErr.message,false);return false;}
  const {error}=await sb.from("artists").insert({id:account.id,stage_name:stage});
  if(error&&!error.message.toLowerCase().includes("duplicate")){toast(error.message,false);return false;}
  account.role="artist";return true;
}

const BUILTIN_ARTIST_ID = "berryd-local-artist";
const BUILTIN_BERRYD_SONGS = [
  {id:"bnw-lakers-love-of-a-thugger-local",title:"Love of a Thugger",artist:"BNW Lakers ft. Berryd",artist_id:BUILTIN_ARTIST_ID,genre:"Afro Fusion",description:"BNW Lakers ft. Berryd — Love of a Thugger",duration:fmt(174.158367),src:"music/bnw-lakers-love-of-a-thugger.mp3",coverUrl:"",audio_path:null,cover_path:null,play_count:0,like_count:0,published_at:"2099-01-05T00:00:00Z",local:true},
  {id:"berryd-tension-local",title:"Tension",artist:"Berryd",artist_id:BUILTIN_ARTIST_ID,genre:"Afrobeats",description:"Berryd — Tension",duration:fmt(179.800816),src:"music/berryd-tension.mp3",coverUrl:"",audio_path:null,cover_path:null,play_count:0,like_count:0,published_at:"2099-01-04T00:00:00Z",local:true},
  {id:"berryd-best-local",title:"Best",artist:"Berryd",artist_id:BUILTIN_ARTIST_ID,genre:"Hip-Hop",description:"Berryd — Best",duration:fmt(108.576),src:"music/berryd-best.mp3",coverUrl:"",audio_path:null,cover_path:null,play_count:0,like_count:0,published_at:"2099-01-03T00:00:00Z",local:true},
  {id:"berryd-introduction-local",title:"Introduction",artist:"Berryd",artist_id:BUILTIN_ARTIST_ID,genre:"Afrobeats",description:"Berryd — Introduction",duration:fmt(194.690612),src:"music/berryd-introduction.mp3",coverUrl:"",audio_path:null,cover_path:null,play_count:0,like_count:0,published_at:"2099-01-02T00:00:00Z",local:true},
  {id:"berryd-stressed-up-local",title:"Stressed Up",artist:"Berryd",artist_id:BUILTIN_ARTIST_ID,genre:"Hip-Hop",description:"Berryd — Stressed Up",duration:fmt(109.714286),src:"music/berryd-stressed-up.mp3",coverUrl:"",audio_path:null,cover_path:null,play_count:0,like_count:0,published_at:"2099-01-01T00:00:00Z",local:true}
];

async function loadSongs(){
  songs=[...BUILTIN_BERRYD_SONGS];
  const {data,error}=await sb.from("tracks").select("id,title,genre,description,audio_path,cover_path,duration_seconds,artist_id,play_count,like_count,published_at,artists(id,stage_name,bio,avatar_url,follower_count)").eq("status","published").order("published_at",{ascending:false});
  if(error){console.warn("Supabase catalogue unavailable; using built-in Berryd catalogue.",error.message);return;}
  for(const row of data||[]){
    if(songs.some(x=>x.title===row.title && x.artist===(row.artists?.stage_name||"Independent Artist"))) continue;
    let src="",coverUrl="";
    if(row.audio_path){const r=await sb.storage.from("audio").createSignedUrl(row.audio_path,3600);src=r.data?.signedUrl||""}
    if(row.cover_path){const r=await sb.storage.from("covers").createSignedUrl(row.cover_path,3600);coverUrl=r.data?.signedUrl||""}
    songs.push({id:row.id,title:row.title,artist:row.artists?.stage_name||"Independent Artist",artist_id:row.artist_id,genre:row.genre||"",description:row.description||"",duration:row.duration_seconds?fmt(row.duration_seconds):"",src,coverUrl,audio_path:row.audio_path,cover_path:row.cover_path,play_count:Number(row.play_count||0),like_count:Number(row.like_count||0),published_at:row.published_at});
  }
}

async function loadArtists(){
  const {data,error}=await sb.from("artists").select("id,stage_name,bio,avatar_url,follower_count,created_at").order("follower_count",{ascending:false}).limit(50);
  if(error){artists=[];return} artists=data||[];
}

async function loadSocial(){
  likedSongIds=new Set();followedArtistIds=new Set();playlists=[];
  if(!account?.id)return;
  const [likes,follows,pls]=await Promise.all([
    sb.from("track_likes").select("track_id").eq("user_id",account.id),
    sb.from("artist_follows").select("artist_id").eq("follower_id",account.id),
    sb.from("playlists").select("id,name,description,cover_url,created_at,updated_at").eq("owner_id",account.id).order("updated_at",{ascending:false})
  ]);
  (likes.data||[]).forEach(x=>likedSongIds.add(x.track_id));
  (follows.data||[]).forEach(x=>followedArtistIds.add(x.artist_id));
  playlists=pls.data||[];
}

async function refreshAll(){await Promise.all([loadSongs(),loadArtists(),loadSocial()])}

function artistButton(id,name){return `<button class="text-btn" onclick="openArtist('${id}')">${esc(name)}</button>`}
function songCard(s){
  return `<article class="card song-card"><div class="cover" ${coverStyle(s.coverUrl)}>♪</div><h3>${esc(s.title)}</h3><p>${artistButton(s.artist_id,s.artist)} · ${esc(s.genre)}</p><div class="muted small song-meta">${s.play_count} plays · ${s.like_count} likes</div><div class="row"><button class="gold-btn compact" onclick="playSong('${s.id}')">▶ Play</button><button class="icon-btn" onclick="toggleLike('${s.id}')">${likedSongIds.has(s.id)?"♥":"♡"}</button></div></article>`
}
function songRows(list,opts={}){
  return list.map(s=>`<div class="song-row"><div class="cover tiny" ${coverStyle(s.coverUrl)}>♪</div><div class="song-main"><b>${esc(s.title)}</b><div class="muted small">${artistButton(s.artist_id,s.artist)} · ${esc(s.genre)}</div></div><span class="muted small likes">${s.like_count} ♥</span><button class="icon-btn" onclick="toggleLike('${s.id}')">${likedSongIds.has(s.id)?"♥":"♡"}</button><button class="icon-btn" onclick="playSong('${s.id}')">▶</button>${opts.playlistId?`<button class="icon-btn" onclick="removeFromPlaylist('${opts.playlistId}','${s.id}')">×</button>`:""}${opts.showAdd&&playlists.length?`<select class="mini-select" id="pl-${s.id}">${playlists.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button class="icon-btn" onclick="addToPlaylist('${s.id}',document.getElementById('pl-${s.id}').value)">＋</button>`:""}</div>`).join("")||empty("No songs here yet.")
}
function artistCard(a){return `<article class="card artist-card"><div class="avatar" ${a.avatar_url?`style="background-image:url('${esc(a.avatar_url)}')"`:""}>${a.avatar_url?"":"♬"}</div><h3>${esc(a.stage_name)}</h3><p class="muted">${Number(a.follower_count||0)} followers</p><button class="icon-btn" onclick="openArtist('${a.id}')">View profile</button></article>`}

async function render(){
  $("#adminNav")?.classList.toggle("hidden",account?.role!=="admin");
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===currentPage));
  const page=$("#page");
  if(currentPage==="home"){
    const fresh=songs.slice(0,8), trending=[...songs].sort((a,b)=>b.like_count-a.like_count||b.play_count-a.play_count).slice(0,6), topArtists=artists.slice(0,6);
    const likedGenres=new Set(songs.filter(s=>likedSongIds.has(s.id)).map(s=>s.genre).filter(Boolean));
    const recommended=songs.filter(s=>followedArtistIds.has(s.artist_id)||likedGenres.has(s.genre)).filter(s=>!likedSongIds.has(s.id)).slice(0,6);
    page.innerHTML=`<section class="hero"><div class="eyebrow">NOBLE WAVE</div><h2>Music Without Borders.</h2><p class="muted">Free listening. Global discovery. Artist-first royalty tracking.</p><div class="hero-actions"><button class="gold-btn compact" onclick="currentPage='discover';render()">Explore music</button><button class="ghost-btn" onclick="currentPage='playlists';render()">My playlists</button></div></section><div class="section-title"><h2>Fresh waves</h2><button class="text-btn" onclick="currentPage='discover';render()">See all</button></div><div class="grid">${fresh.map(songCard).join("")||empty("Published music will appear here.")}</div><div class="section-title"><h2>Trending now</h2></div><div class="grid">${trending.map(songCard).join("")||empty("No trending songs yet.")}</div><div class="section-title"><h2>Recommended for you</h2></div><div class="grid">${recommended.map(songCard).join("")||trending.map(songCard).join("")||empty("Like songs or follow artists to personalize your recommendations.")}</div><div class="section-title"><h2>Artists to discover</h2></div><div class="grid">${topArtists.map(artistCard).join("")||empty("Artist profiles will appear here as artists join NOBLE WAVE.")}</div>`;
  }
  if(currentPage==="discover"){
    const genres=["Afrobeats","Afro-fusion","Alté","R&B","Hip-Hop","Amapiano","Pop","Electronic"];
    page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Explore</div><h1>Discover</h1></div></div><div class="genre-grid">${genres.map(g=>`<button class="genre-card" onclick="filterGenre('${g}')"><span>◈</span><b>${g}</b><small>Explore ${g}</small></button>`).join("")}</div><div class="section-title"><h2>Popular tracks</h2></div><div class="grid">${[...songs].sort((a,b)=>b.like_count-a.like_count).map(songCard).join("")||empty("No published tracks yet.")}</div><div class="section-title"><h2>Artists</h2></div><div class="grid">${artists.map(artistCard).join("")||empty("No artists yet.")}</div>`;
  }
  if(currentPage==="search")page.innerHTML=`<h1>Search</h1><input class="searchbox" id="searchInput" placeholder="Search songs, artists or genres..." oninput="doSearch(this.value)"><div id="searchResults">${songRows(songs)}</div>`;
  if(currentPage==="library")page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Your music</div><h1>Library</h1></div><button class="gold-btn compact" onclick="currentPage='playlists';render()">View playlists</button></div><div class="section-title"><h2>Liked songs</h2></div>${songRows(songs.filter(s=>likedSongIds.has(s.id)))}`;
  if(currentPage==="playlists")await renderPlaylists(page);
  if(currentPage==="artist")await renderArtistPage(page);
  if(currentPage==="admin")await renderAdmin(page);
  if(currentPage==="royalties")await renderRoyalties(page);
  if(currentPage==="payouts")await renderPayouts(page);
  if(currentPage==="rights")await renderRights(page);
  if(currentPage==="upload")page.innerHTML=`<h1>Upload Music</h1><p class="muted">Upload audio and cover art to secure cloud storage. Publishing is a separate review action.</p><form id="uploadForm" class="card form-grid"><label>Track title <input id="trackTitle" required placeholder="Song title"></label><label>Genre <input id="trackGenre" required placeholder="Afrobeats"></label><label>Artist name <input id="trackArtist" value="${esc(account?.display_name||"")}" required></label><label>Cover image <input id="coverFile" type="file" accept="image/*"></label><label class="full">Audio file <input id="audioFile" type="file" accept="audio/*" required></label><button class="gold-btn full">Upload to NOBLE WAVE</button></form><div id="uploadMsg"></div>`;
  if(currentPage==="settings")page.innerHTML=`<h1>Settings</h1><div class="card profile-settings"><div class="avatar large" ${account?.avatar_url?`style="background-image:url('${esc(account.avatar_url)}')"`:""}>${account?.avatar_url?"":"◎"}</div><div><h3>${esc(account?.display_name||"")}</h3><p class="muted">${esc(account?.email||"")} · ${esc(account?.role||"listener")}</p></div></div><div class="card" style="margin-top:12px"><h3>Backend</h3><p class="muted">Connected to Supabase Auth, PostgreSQL, Storage and secure stream recording.</p></div><button class="ghost-btn" onclick="signOut()">Log out</button>`;
}

async function renderArtistPage(page){
  if(viewArtistId){
    if(viewArtistId===BUILTIN_ARTIST_ID){
      const a={id:BUILTIN_ARTIST_ID,stage_name:"Berryd",bio:"Independent artist on NOBLE WAVE. Music by Berryd.",avatar_url:null,follower_count:0};
      const mine=songs.filter(s=>s.artist_id===BUILTIN_ARTIST_ID);
      page.innerHTML=`<button class="text-btn" onclick="viewArtistId=null;currentPage='discover';render()">← Back to discover</button><section class="artist-hero"><div class="avatar xlarge">♬</div><div><div class="eyebrow">Artist</div><h1>Berryd</h1><p class="muted">${esc(a.bio)}</p><div class="artist-stats"><span><b>${mine.length}</b> tracks</span><span><b>Free</b> listening</span></div></div></section><div class="section-title"><h2>Music</h2></div>${songRows(mine)}`;
      return;
    }
    const {data:a}=await sb.from("artists").select("id,stage_name,bio,avatar_url,follower_count").eq("id",viewArtistId).maybeSingle();
    if(!a){page.innerHTML=empty("Artist not found.");return}
    const {data:rows}=await sb.from("tracks").select("id,title,genre,audio_path,cover_path,duration_seconds,artist_id,play_count,like_count,published_at,artists(id,stage_name)").eq("artist_id",a.id).eq("status","published").order("published_at",{ascending:false});
    const mine=songs.filter(s=>s.artist_id===a.id);
    page.innerHTML=`<button class="text-btn" onclick="viewArtistId=null;currentPage='discover';render()">← Back to discover</button><section class="artist-hero"><div class="avatar xlarge" ${a.avatar_url?`style="background-image:url('${esc(a.avatar_url)}')"`:""}>${a.avatar_url?"":"♬"}</div><div><div class="eyebrow">Artist</div><h1>${esc(a.stage_name)}</h1><p class="muted">${esc(a.bio||"Independent artist on NOBLE WAVE.")}</p><div class="artist-stats"><span><b>${Number(a.follower_count||0)}</b> followers</span><span><b>${mine.length}</b> tracks</span></div><button class="gold-btn compact" onclick="toggleFollow('${a.id}')">${followedArtistIds.has(a.id)?"Following ✓":"Follow artist"}</button></div></section><div class="section-title"><h2>Music</h2></div>${songRows(mine)}<div class="card" style="margin-top:16px"><h3>Report a rights issue</h3><form id="takedownForm" class="form-grid"><label class="full">Reason<textarea id="takedownReason" minlength="10" maxlength="2000" required placeholder="Explain the rights or copyright issue"></textarea></label><label class="full">Evidence URL (optional)<input id="takedownEvidence" placeholder="https://..."></label><label class="full">Reporter email (optional)<input id="takedownEmail" type="email" placeholder="you@example.com"></label><button class="ghost-btn full">Submit report</button></form></div>`;
    return;
  }
  const {data:mineRows}=await sb.from("tracks").select("id,title,genre,status,review_status,artist_id,artists(stage_name)").eq("artist_id",account?.id||"00000000-0000-0000-0000-000000000000").order("created_at",{ascending:false});
  const {data:a}=await sb.from("artists").select("id,stage_name,bio,avatar_url,follower_count").eq("id",account?.id||"00000000-0000-0000-0000-000000000000").maybeSingle();
  const {count}=await sb.from("streams").select("id",{count:"exact",head:true}).eq("listener_id",account?.id||"00000000-0000-0000-0000-000000000000");
  const mine=(mineRows||[]).map(r=>({id:r.id,title:r.title,artist:r.artists?.stage_name||account?.display_name||"Artist",genre:r.genre||"",artist_id:r.artist_id,status:r.status,review_status:r.review_status,coverUrl:""}));
  page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Artist Hub</div><h1>${esc(a?.stage_name||account?.display_name||"Artist")}</h1></div><div class="row"><button class="ghost-btn" onclick="openArtist('${a?.id||account?.id}')">Public profile</button><button class="gold-btn compact" onclick="currentPage='upload';render()">＋ Upload</button></div></div><div class="artist-hero mini"><div class="avatar xlarge" ${a?.avatar_url?`style="background-image:url('${esc(a.avatar_url)}')"`:""}>${a?.avatar_url?"":"♬"}</div><div><p class="muted">${esc(a?.bio||"Build your artist profile and release music to the world.")}</p><div class="artist-stats"><span><b>${Number(a?.follower_count||0)}</b> followers</span><span><b>${mine.length}</b> tracks</span><span><b>${count||0}</b> listening events</span></div></div></div><div class="card profile-editor"><h3>Edit artist profile</h3><form id="artistProfileForm" class="form-grid"><label>Stage name <input id="artistStageName" value="${esc(a?.stage_name||account?.display_name||"")}" maxlength="80" required></label><label>Avatar URL <input id="artistAvatar" value="${esc(a?.avatar_url||"")}" placeholder="https://..."></label><label class="full">Bio <input id="artistBio" value="${esc(a?.bio||"")}" maxlength="240" placeholder="Tell listeners who you are"></label><button class="gold-btn full">Save artist profile</button></form></div><div class="section-title"><h2>Your catalogue</h2></div>${mine.map(s=>`<div class="song-row"><div class="cover tiny">♪</div><div class="song-main"><b>${esc(s.title)}</b><div class="muted small">${esc(s.genre)} · <span class="status-pill">${esc(s.review_status||s.status)}</span></div></div>${s.review_status==='draft'||s.review_status==='rejected'?`<button class="ghost-btn" onclick="submitTrack('${s.id}')">Submit</button>`:''}</div>`).join("")||empty("No uploads yet.")}`;
  $("#artistProfileForm").onsubmit=saveArtistProfile;
}


async function saveArtistProfile(e){e.preventDefault();const stage_name=$("#artistStageName").value.trim(),bio=$("#artistBio").value.trim(),avatar_url=$("#artistAvatar").value.trim()||null;const {error}=await sb.from("artists").update({stage_name,bio,avatar_url}).eq("id",account.id);if(error){toast(error.message,false);return}await sb.from("profiles").update({display_name:stage_name,avatar_url}).eq("id",account.id);account.display_name=stage_name;account.avatar_url=avatar_url;toast("Artist profile updated");await refreshAll();render()}

async function renderPlaylists(page){
  if(viewPlaylistId){
    const p=playlists.find(x=>x.id===viewPlaylistId);
    if(!p){viewPlaylistId=null;return renderPlaylists(page)}
    const {data:items}=await sb.from("playlist_tracks").select("track_id,position").eq("playlist_id",p.id).order("position",{ascending:true});
    const list=(items||[]).map(x=>songs.find(s=>s.id===x.track_id)).filter(Boolean);
    page.innerHTML=`<button class="text-btn" onclick="viewPlaylistId=null;render()">← Back to playlists</button><section class="playlist-hero"><div class="cover big-cover">♫</div><div><div class="eyebrow">Playlist</div><h1>${esc(p.name)}</h1><p class="muted">${esc(p.description||"Your personal NOBLE WAVE collection.")}</p><span class="status-pill">${list.length} songs</span></div></section><div class="section-title"><h2>Tracks</h2><button class="ghost-btn" onclick="deletePlaylist('${p.id}')">Delete playlist</button></div>${songRows(list,{playlistId:p.id})}`;
    return;
  }
  page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Your collections</div><h1>Playlists</h1></div></div><form id="playlistForm" class="card form-grid"><label>Playlist name <input id="playlistName" required maxlength="80" placeholder="Late Night Waves"></label><label>Description <input id="playlistDescription" placeholder="A collection of my favorites"></label><button class="gold-btn full">＋ Create playlist</button></form><div class="section-title"><h2>Your playlists</h2></div><div class="grid">${playlists.map(p=>`<article class="card playlist-card"><div class="cover">♫</div><h3>${esc(p.name)}</h3><p>${esc(p.description||"Personal playlist")}</p><button class="icon-btn" onclick="openPlaylist('${p.id}')">Open playlist</button></article>`).join("")||empty("Create your first playlist above.")}</div><div class="section-title"><h2>Add music</h2></div>${songRows(songs,{showAdd:true})}`;
  $("#playlistForm").onsubmit=createPlaylist;
}

async function renderAdmin(page){
  if(account?.role!=="admin"){page.innerHTML=`<h1>Admin</h1>${empty("Admin access is required for publishing and royalty-period operations.")}`;return}
  const {data:reviewRows}=await sb.from("tracks").select("id,title,genre,status,review_status,artist_id,created_at,artists(stage_name)").order("created_at",{ascending:false}).limit(100);
  const {data:periods}=await sb.from("royalty_periods").select("id,period_start,period_end,revenue_pool_amount,status,eligible_streams,calculated_at").order("period_start",{ascending:false}).limit(20);
  page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Operations</div><h1>Admin Console</h1></div></div><div class="card"><h3>Publishing review</h3><p class="muted">Approve submitted music to make it available publicly.</p>${(reviewRows||[]).map(t=>`<div class="song-row"><div class="cover tiny">♪</div><div class="song-main"><b>${esc(t.title)}</b><div class="muted small">${esc(t.artists?.stage_name||"Artist")} · ${esc(t.genre||"")} · ${esc(t.review_status)}</div></div>${t.review_status==='submitted'?`<button class="gold-btn compact" onclick="approveTrack('${t.id}')">Publish</button><button class="ghost-btn" onclick="rejectTrack('${t.id}')">Reject</button>`:''}</div>`).join("")||empty("No tracks in review.")}</div><div class="card" style="margin-top:14px"><h3>Royalty periods</h3><form id="periodForm" class="form-grid"><label>Start <input id="periodStart" type="date" required></label><label>End <input id="periodEnd" type="date" required></label><label class="full">Revenue pool (USD) <input id="periodPool" type="number" min="0" step="0.01" required placeholder="50000"></label><button class="gold-btn full">Create period</button></form>${(periods||[]).map(p=>`<div class="song-row"><div class="song-main"><b>${esc(p.period_start)} → ${esc(p.period_end)}</b><div class="muted small">$${Number(p.revenue_pool_amount||0).toFixed(2)} · ${p.status} · ${p.eligible_streams||0} eligible streams</div></div>${p.status==='open'?`<button class="gold-btn compact" onclick="calculateRoyaltyPeriod('${p.id}')">Calculate</button>`:''}</div>`).join("")}</div><div class="card" style="margin-top:14px"><h3>Rights review</h3><p class="muted">Verify ownership declarations before royalty calculation.</p><div id="rightsReview">Loading…</div></div><div class="card" style="margin-top:14px"><h3>Takedown reports</h3><div id="takedownReview">Loading…</div></div>`;
  $("#periodForm").onsubmit=createRoyaltyPeriod;await loadAdminModeration();
}
async function loadAdminModeration(){
  const [{data:rights},{data:reports}]=await Promise.all([sb.from("rights_declarations").select("track_id,artist_id,declaration_status,master_control_percent,composition_control_percent,explicit_content").eq("declaration_status","pending").limit(100),sb.from("takedown_reports").select("id,track_id,reporter_email,reason,status,created_at").in("status",["open","reviewing"]).limit(100)]);
  $("#rightsReview").innerHTML=(rights||[]).map(x=>`<div class="song-row"><div class="song-main"><b>${esc(x.track_id)}</b><div class="muted small">Master ${Number(x.master_control_percent)}% · Composition ${Number(x.composition_control_percent)}%</div></div><button class="gold-btn compact" onclick="reviewRights('${x.track_id}','verified')">Verify</button><button class="ghost-btn" onclick="reviewRights('${x.track_id}','rejected')">Reject</button></div>`).join("")||empty("No rights declarations waiting for review.");
  $("#takedownReview").innerHTML=(reports||[]).map(x=>`<div class="song-row"><div class="song-main"><b>${esc(x.track_id)}</b><div class="muted small">${esc(x.reason)} · ${esc(x.status)}</div></div><button class="ghost-btn" onclick="reviewTakedown('${x.id}','reviewing')">Review</button><button class="gold-btn compact" onclick="reviewTakedown('${x.id}','resolved','${x.track_id}')">Resolve / block</button><button class="ghost-btn" onclick="reviewTakedown('${x.id}','rejected')">Reject</button></div>`).join("")||empty("No open takedown reports.");
}
window.reviewRights=async(track_id,status)=>{try{const {data:{session}}=await sb.auth.getSession();const r=await fetch(`${SUPABASE_URL}/functions/v1/admin-moderation`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({type:"rights",track_id,status})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Review failed");toast("Rights review updated");render()}catch(e){toast(e.message,false)}};
window.reviewTakedown=async(id,status,track_id)=>{try{const {data:{session}}=await sb.auth.getSession();const r=await fetch(`${SUPABASE_URL}/functions/v1/admin-moderation`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({type:"takedown",id,status,track_id})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Review failed");toast("Takedown review updated");render()}catch(e){toast(e.message,false)}};

async function renderRoyalties(page){
  const id=account?.id||"00000000-0000-0000-0000-000000000000";
  const [{data},{data:lines}]=await Promise.all([
    sb.from("royalty_ledger").select("net_amount,status,period_start,period_end,artist_streams,artist_share_percent").eq("artist_id",id).order("period_start",{ascending:false}),
    sb.from("royalty_line_items").select("net_amount,role,split_percent,track_id,period_id").eq("beneficiary_id",id).order("created_at",{ascending:false}).limit(100)
  ]);
  const available=(data||[]).filter(x=>x.status==="available").reduce((a,x)=>a+Number(x.net_amount||0),0), pending=(data||[]).filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.net_amount||0),0), lifetime=(data||[]).reduce((a,x)=>a+Number(x.net_amount||0),0);
  page.innerHTML=`<h1>Royalties</h1><div class="notice">Balances are calculated from validated stream events and configured revenue pools. Commercial payouts still require rights verification, fraud controls, contracts, payment/KYC and tax infrastructure.</div><div class="stat-grid" style="margin-top:14px"><div class="stat"><span class="muted">Available</span><b>$${available.toFixed(2)}</b></div><div class="stat"><span class="muted">Pending</span><b>$${pending.toFixed(2)}</b></div><div class="stat"><span class="muted">Lifetime</span><b>$${lifetime.toFixed(2)}</b></div><div class="stat"><span class="muted">Periods</span><b>${data?.length||0}</b></div></div><div class="section-title"><h2>Statements</h2></div>${(data||[]).map(x=>`<div class="song-row"><div class="song-main"><b>${esc(x.period_start)} → ${esc(x.period_end)}</b><div class="muted small">${x.artist_streams||0} streams · ${Number(x.artist_share_percent||0).toFixed(3)}% share · ${esc(x.status)}</div></div><strong>$${Number(x.net_amount||0).toFixed(2)}</strong></div>`).join("")||empty("No royalty statements yet.")}<div class="section-title"><h2>Your split earnings</h2></div>${(lines||[]).map(x=>`<div class="song-row"><div class="song-main"><b>${esc(x.role)}</b><div class="muted small">${Number(x.split_percent||0).toFixed(2)}% split</div></div><strong>$${Number(x.net_amount||0).toFixed(2)}</strong></div>`).join("")||empty("No split line items yet.")}`;
}


async function renderPayouts(page){
  if(account?.role!=="artist" && account?.role!=="admin"){page.innerHTML=`<h1>Payouts</h1>${empty("Create an artist profile to request royalties.")}`;return}
  const [{data:ledger},{data:requests}]=await Promise.all([
    sb.from("royalty_ledger").select("net_amount,status,period_start,period_end").eq("artist_id",account.id).order("period_start",{ascending:false}),
    sb.from("payout_requests").select("id,amount,currency,status,provider,requested_at,processed_at").eq("artist_id",account.id).order("requested_at",{ascending:false})
  ]);
  const available=(ledger||[]).filter(x=>x.status==="available").reduce((a,x)=>a+Number(x.net_amount||0),0);
  const reserved=(requests||[]).filter(x=>["requested","processing"].includes(x.status)).reduce((a,x)=>a+Number(x.amount||0),0);
  const withdrawable=Math.max(0,available-reserved);
  page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Artist earnings</div><h1>Payouts</h1></div></div><div class="notice">Payout requests are recorded securely. A real money transfer still requires a connected payment provider, identity verification, tax information and an approved payout account.</div><div class="stat-grid" style="margin-top:14px"><div class="stat"><span class="muted">Available</span><b>$${available.toFixed(2)}</b></div><div class="stat"><span class="muted">Reserved</span><b>$${reserved.toFixed(2)}</b></div><div class="stat"><span class="muted">Withdrawable</span><b>$${withdrawable.toFixed(2)}</b></div></div><form id="payoutForm" class="card form-grid" style="margin-top:14px"><label>Amount (USD)<input id="payoutAmount" type="number" min="10" max="${withdrawable.toFixed(2)}" step="0.01" required placeholder="10.00"></label><label>Provider<input id="payoutProvider" maxlength="50" placeholder="Payment provider"></label><label class="full">Provider account/reference<input id="payoutReference" maxlength="200" placeholder="Provider customer or connected-account reference"></label><button class="gold-btn full" ${withdrawable<10?'disabled':''}>Request payout</button></form><div class="section-title"><h2>Requests</h2></div>${(requests||[]).map(x=>`<div class="song-row"><div class="song-main"><b>$${Number(x.amount||0).toFixed(2)} ${esc(x.currency)}</b><div class="muted small">${esc(x.provider||"No provider")} · ${esc(x.status)} · ${esc(x.requested_at||"")}</div></div></div>`).join("")||empty("No payout requests yet.")}`;
  $("#payoutForm").onsubmit=requestPayout;
}
async function requestPayout(e){
  e.preventDefault();
  try{const {data:{session}}=await sb.auth.getSession();if(!session){toast("Please log in",false);return}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/request-payout`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({amount:Number($("#payoutAmount").value),provider:$("#payoutProvider").value.trim(),provider_reference:$("#payoutReference").value.trim()})});
    const body=await r.json();if(!r.ok)throw new Error(body.error||"Payout request failed");toast("Payout request submitted");render();
  }catch(err){toast(err.message,false)}
}
async function renderRights(page){
  if(!account?.id){page.innerHTML=empty("Log in to manage rights.");return}
  const {data:rows}=await sb.from("tracks").select("id,title,genre,status,review_status").eq("artist_id",account.id).order("created_at",{ascending:false});
  const ids=(rows||[]).map(x=>x.id);let rights=[];if(ids.length){const r=await sb.from("rights_declarations").select("track_id,master_control_percent,composition_control_percent,explicit_content,declaration_status,declaration_text").in("track_id",ids);rights=r.data||[]}
  const byId=new Map(rights.map(x=>[x.track_id,x]));
  page.innerHTML=`<div class="section-title"><div><div class="eyebrow">Copyright & ownership</div><h1>Rights</h1></div></div><div class="notice">Only submit music you have the legal right to distribute. Rights declarations are reviewed before streams can become royalty-eligible.</div>${(rows||[]).map(t=>{const r=byId.get(t.id)||{};return `<div class="card" style="margin-top:12px"><div class="section-title"><div><h3>${esc(t.title)}</h3><div class="muted small">${esc(t.genre||"")} · ${esc(r.declaration_status||"not declared")}</div></div></div><form class="form-grid rights-form" data-track="${t.id}"><label>Master control %<input name="master" type="number" min="0" max="100" value="${Number(r.master_control_percent??100)}" required></label><label>Composition control %<input name="composition" type="number" min="0" max="100" value="${Number(r.composition_control_percent??100)}" required></label><label><input name="explicit" type="checkbox" ${r.explicit_content?'checked':''}> Explicit content</label><label class="full">Declaration<textarea name="text" maxlength="1000" required placeholder="I confirm I have the rights to distribute this recording and the stated composition share.">${esc(r.declaration_text||"")}</textarea></label><button class="gold-btn full">Save rights declaration</button></form></div>`}).join("")||empty("Upload a track first.")}`;
  $$(".rights-form").forEach(f=>f.onsubmit=saveRightsDeclaration);
}
async function saveRightsDeclaration(e){e.preventDefault();const f=e.target,id=f.dataset.track,fd=new FormData(f);const payload={track_id:id,artist_id:account.id,master_control_percent:Number(fd.get("master")),composition_control_percent:Number(fd.get("composition")),explicit_content:f.querySelector('[name="explicit"]').checked,declaration_text:String(fd.get("text")||""),declaration_status:"pending"};const {error}=await sb.from("rights_declarations").upsert(payload,{onConflict:"track_id"});if(error){toast(error.message,false);return}toast("Rights declaration saved for review");render()}
async function submitTakedown(trackId){const reason=$("#takedownReason").value.trim(),evidence_url=$("#takedownEvidence").value.trim()||null,reporter_email=$("#takedownEmail").value.trim()||account?.email||null;const {error}=await sb.from("takedown_reports").insert({track_id:trackId,reason,evidence_url,reporter_email});if(error)toast(error.message,false);else{toast("Rights report submitted");$("#takedownForm").reset()}}

function filterGenre(g){currentPage="search";render().then(()=>{$("#searchInput").value=g;doSearch(g)})}
function doSearch(q){const x=(q||"").toLowerCase();const found=songs.filter(s=>(s.title+" "+s.artist+" "+s.genre).toLowerCase().includes(x));$("#searchResults").innerHTML=songRows(found)}
window.openArtist=id=>{viewArtistId=id;currentPage="artist";render()};
window.openPlaylist=id=>{viewPlaylistId=id;currentPage="playlists";render()};

window.playSong=async id=>{
  const i=songs.findIndex(s=>s.id===id);if(i<0)return;currentIndex=i;currentSong=songs[i];
  $("#nowTitle").textContent=currentSong.title;$("#nowArtist").textContent=currentSong.artist;$("#nowArt").setAttribute("style",currentSong.coverUrl?`background-image:url('${esc(currentSong.coverUrl)}');background-size:cover;background-position:center`:"");
  if(currentSong.src){audio.src=currentSong.src;audio.play().catch(()=>{});$("#playBtn").textContent="❚❚"}else{audio.removeAttribute("src");audio.pause();$("#playBtn").textContent="▶"}
};

window.toggleLike=async id=>{
  const target=songs.find(s=>s.id===id);
  if(target?.local){toast("Built-in Berryd tracks are playable now; log in to save likes.");return}
  if(!account){toast("Log in to like music",false);return}
  const liked=likedSongIds.has(id);
  const q=liked?sb.from("track_likes").delete().eq("user_id",account.id).eq("track_id",id):sb.from("track_likes").insert({user_id:account.id,track_id:id});
  const {error}=await q;if(error){toast(error.message,false);return}
  liked?likedSongIds.delete(id):likedSongIds.add(id);const s=songs.find(x=>x.id===id);if(s)s.like_count+=liked?-1:1;render();
};
window.toggleFollow=async artistId=>{
  if(!account){toast("Log in to follow artists",false);return}
  if(artistId===account.id){toast("You cannot follow your own artist profile");return}
  const following=followedArtistIds.has(artistId);
  const q=following?sb.from("artist_follows").delete().eq("follower_id",account.id).eq("artist_id",artistId):sb.from("artist_follows").insert({follower_id:account.id,artist_id:artistId});
  const {error}=await q;if(error){toast(error.message,false);return}
  following?followedArtistIds.delete(artistId):followedArtistIds.add(artistId);await loadArtists();render();
};

window.addToPlaylist=async(trackId,playlistId)=>{
  if(!playlistId){toast("Choose a playlist",false);return}
  const {data:last}=await sb.from("playlist_tracks").select("position").eq("playlist_id",playlistId).order("position",{ascending:false}).limit(1).maybeSingle();
  const {error}=await sb.from("playlist_tracks").insert({playlist_id:playlistId,track_id:trackId,position:Number(last?.position||-1)+1});
  if(error){toast(error.code==="23505"?"That song is already in the playlist.":error.message,false);return}toast("Added to playlist");
};
window.removeFromPlaylist=async(playlistId,trackId)=>{const {error}=await sb.from("playlist_tracks").delete().eq("playlist_id",playlistId).eq("track_id",trackId);if(error)toast(error.message,false);else render()};
async function createPlaylist(e){e.preventDefault();const name=$("#playlistName").value.trim(),description=$("#playlistDescription").value.trim();const {data,error}=await sb.from("playlists").insert({owner_id:account.id,name,description}).select("id,name,description,cover_url,created_at,updated_at").single();if(error){toast(error.message,false);return}playlists.unshift(data);toast("Playlist created");render()}
window.deletePlaylist=async id=>{if(!confirm("Delete this playlist?"))return;const {error}=await sb.from("playlists").delete().eq("id",id).eq("owner_id",account.id);if(error)toast(error.message,false);else{playlists=playlists.filter(p=>p.id!==id);viewPlaylistId=null;render()}};

async function recordStream(){
  if(!currentSong||streamRecorded.has(currentSong.id)||!audio.currentTime||audio.currentTime<30)return;
  streamRecorded.add(currentSong.id);
  try{const {data:{session}}=await sb.auth.getSession();if(!session)return;await fetch(`${SUPABASE_URL}/functions/v1/record-stream`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({track_id:currentSong.id,seconds_played:Math.floor(audio.currentTime),completed:audio.duration?audio.currentTime/audio.duration>=0.9:false,revenue_source:"organic"})});const s=songs.find(x=>x.id===currentSong.id);if(s)s.play_count+=1}catch(e){console.warn("stream record failed",e)}
}

$("#playBtn").onclick=()=>{if(!currentSong){toast("Choose a song first");return}if(!audio.src){toast("This track has no playable audio");return}audio.paused?(audio.play(),$("#playBtn").textContent="❚❚"):(audio.pause(),$("#playBtn").textContent="▶")};
$("#prevBtn").onclick=()=>songs.length&&playSong(songs[(currentIndex-1+songs.length)%songs.length].id);
$("#nextBtn").onclick=()=>songs.length&&playSong(songs[(currentIndex+1)%songs.length].id);
$("#volume").oninput=e=>audio.volume=e.target.value;
audio.ontimeupdate=()=>{if(audio.duration){$("#seek").value=audio.currentTime/audio.duration*100;$("#timeLabel").textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;recordStream()}};
$("#seek").oninput=e=>{if(audio.duration)audio.currentTime=e.target.value/100*audio.duration};
audio.onplay=()=>$("#playBtn").textContent="❚❚";audio.onpause=()=>$("#playBtn").textContent="▶";audio.onended=()=>$("#nextBtn").click();

window.submitTrack=async id=>{const {error}=await sb.from("tracks").update({review_status:"submitted"}).eq("id",id).eq("artist_id",account?.id);if(error)toast(error.message,false);else{toast("Track submitted for review");render()}};
window.approveTrack=async id=>{const {error}=await sb.from("tracks").update({review_status:"approved",status:"published",published_at:new Date().toISOString(),rejection_reason:null}).eq("id",id);if(error)toast(error.message,false);else{toast("Track published");await refreshAll();render()}};
window.rejectTrack=async id=>{const reason=prompt("Reason for rejection (optional):")||"Not approved";const {error}=await sb.from("tracks").update({review_status:"rejected",status:"draft",rejection_reason:reason}).eq("id",id);if(error)toast(error.message,false);else{toast("Track returned to artist");render()}};
async function createRoyaltyPeriod(e){e.preventDefault();const start=$("#periodStart").value,end=$("#periodEnd").value,pool=Number($("#periodPool").value);if(!start||!end||pool<0)return;const {error}=await sb.from("royalty_periods").insert({period_start:start,period_end:end,revenue_pool_amount:pool,status:"open"});if(error)toast(error.message,false);else{toast("Royalty period created");render()}}
window.calculateRoyaltyPeriod=async id=>{try{const {data:{session}}=await sb.auth.getSession();if(!session){toast("Please log in",false);return}const r=await fetch(`${SUPABASE_URL}/functions/v1/calculate-royalties`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({period_id:id})});const body=await r.json();if(!r.ok)throw new Error(body.error||"Calculation failed");toast(`Royalty calculation complete: ${body.line_items} line items`);render()}catch(e){toast(e.message,false)}};

async function handleUpload(e){
  e.preventDefault();const btn=$("#uploadBtn");if(btn)btn.disabled=true;if(!account?.id){toast("Please log in first",false);if(btn)btn.disabled=false;return}if(!(await ensureArtistProfile())){if(btn)btn.disabled=false;return}
  const af=$("#audioFile").files[0],cf=$("#coverFile").files[0];if(!af){toast("Choose an audio file first",false);if(btn)btn.disabled=false;return}const title=$("#trackTitle").value.trim(),genre=$("#trackGenre").value.trim(),base=`${account.id}/${crypto.randomUUID()}`;
  const audioPath=`${base}-${af.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:ae}=await sb.storage.from("audio").upload(audioPath,af,{contentType:af.type||"audio/mpeg",upsert:false});if(ae){toast(ae.message,false);if(btn)btn.disabled=false;return}
  let coverPath=null;if(cf){coverPath=`${base}-${cf.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:ce}=await sb.storage.from("covers").upload(coverPath,cf,{contentType:cf.type||"image/jpeg",upsert:false});if(ce){await sb.storage.from("audio").remove([audioPath]);toast(ce.message,false);if(btn)btn.disabled=false;return}}
  const {error:te}=await sb.from("tracks").insert({artist_id:account.id,title,genre,audio_path:audioPath,cover_path:coverPath,status:"draft",review_status:"draft"});
  if(te){await sb.storage.from("audio").remove([audioPath]);if(coverPath)await sb.storage.from("covers").remove([coverPath]);toast(te.message,false);if(btn)btn.disabled=false;return}
  $("#uploadMsg").innerHTML=`<div class="notice" style="margin-top:12px">“${esc(title)}” uploaded securely as a draft.</div>`;e.target.reset();$("#trackArtist").value=account.display_name;await refreshAll();if(btn)btn.disabled=false;
}
document.addEventListener("change",e=>{if(e.target.id==="audioFile"){const f=e.target.files&&e.target.files[0];const out=$("#audioFileName");if(out)out.textContent=f?`Selected: ${f.name} · ${(f.size/1048576).toFixed(1)} MB`:"No audio file selected";}});document.addEventListener("submit",e=>{if(e.target.id==="uploadForm")handleUpload(e)});

async function signOut(){await sb.auth.signOut();location.reload()}window.signOut=signOut;$("#logoutBtn").onclick=signOut;
$$('.nav').forEach(n=>n.onclick=()=>{viewArtistId=null;viewPlaylistId=null;currentPage=n.dataset.page;render()});
$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');authMode=t.dataset.auth;$("#authName").parentElement.style.display=authMode==="signup"?"block":"none";$("#authSubmit").textContent=authMode==="signup"?"Create account":"Log in"});
$("#authName").parentElement.style.display="none";
$("#authForm").onsubmit=async e=>{e.preventDefault();const email=$("#authEmail").value.trim(),password=$("#authPassword").value,name=$("#authName").value.trim()||email.split("@")[0];$("#authSubmit").disabled=true;if(authMode==="signup"){const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name}}});if(error){toast(error.message,false);$("#authSubmit").disabled=false;return}if(data.session){const {error:pe}=await sb.from("profiles").insert({id:data.user.id,display_name:name,role:"listener"});if(pe&&pe.code!=="23505")toast(pe.message,false);await loadAccount(data.user);$("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");await refreshAll();await render()}else toast("Account created. Check your email to confirm, then log in.")}else{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error){toast(error.message,false);$("#authSubmit").disabled=false;return}await loadAccount(data.user);$("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");await refreshAll();await render()}$("#authSubmit").disabled=false};

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden")});$("#installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt=null};

(async()=>{const {data:{session}}=await sb.auth.getSession();if(session) await loadAccount(session.user);$("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");await refreshAll();await render()})();
