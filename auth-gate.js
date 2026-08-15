(() => {
  "use strict";
  const SUPABASE_URL="https://rwxujvpakpemiwkitltk.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_aN_1_fzAV3hR6FmW7FTZGg_6SF0MUHF";


const HV_ACTIVE_COOKIE="hv-active-user";
function hvSetActiveUser(userId){
  document.cookie=`${HV_ACTIVE_COOKIE}=${encodeURIComponent(userId||"")}; Domain=.hawkvisionai.com; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
}
function hvGetActiveUser(){
  const p=HV_ACTIVE_COOKIE+"=";
  const row=document.cookie.split("; ").find(v=>v.startsWith(p));
  return row?decodeURIComponent(row.slice(p.length)):"";
}
function hvClearActiveUser(){
  document.cookie=`${HV_ACTIVE_COOKIE}=; Domain=.hawkvisionai.com; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}
async function hvAcceptSso(client){
  const hash=new URLSearchParams(location.hash.replace(/^#/,""));
  const access_token=hash.get("hv_at");
  const refresh_token=hash.get("hv_rt");
  if(access_token&&refresh_token){
    const {data,error}=await client.auth.setSession({access_token,refresh_token});
    history.replaceState(null,"",location.pathname+location.search);
    if(error)throw error;
    if(data?.user)hvSetActiveUser(data.user.id);
    return data?.session||null;
  }
  return null;
}
async function hvValidateActiveIdentity(client,session){
  const active=hvGetActiveUser();
  if(!session?.user)return false;
  if(active && active!==session.user.id){
    await client.auth.signOut({scope:"local"}).catch(()=>{});
    return false;
  }
  hvSetActiveUser(session.user.id);
  return true;
}

  const client=supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  async function globalLogout(){
    await client.auth.signOut({scope:"global"}).catch(()=>{}); hvClearActiveUser();
    window.location.href="https://hawkvisionai.com/";
  }

  async function boot(){
    document.getElementById("analysisLogoutBtn")?.addEventListener("click",globalLogout);

    await hvAcceptSso(client).catch(()=>{});
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user || !(await hvValidateActiveIdentity(client,session))){
      window.location.replace("https://hawkvisionai.com/");
      return;
    }

    const {data:allowed,error}=await client.rpc("hv_has_product_access",{
      p_user_id:session.user.id,
      p_product_key:"analysis_engine"
    });
    if(error || allowed!==true){
      window.location.replace("https://hawkvisionai.com/");
      return;
    }

    const {data:profile}=await client.from("profiles").select("display_name,email").eq("id",session.user.id).maybeSingle();
    const identity=document.getElementById("analysisIdentity");
    if(identity){
      const account=(profile?.email||session.user.email||"").split("@")[0];
      identity.textContent=`${profile?.display_name||account}（${account}）`;
    }

    const script=document.createElement("script");
    script.src="app.js?v=3.2.0";
    document.body.appendChild(script);
  }

  boot().catch(()=>window.location.replace("https://hawkvisionai.com/"));
})();
