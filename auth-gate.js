(() => {
  "use strict";
  const SUPABASE_URL="https://rwxujvpakpemiwkitltk.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_aN_1_fzAV3hR6FmW7FTZGg_6SF0MUHF";

const HAWKVISION_AUTH_COOKIE="hv-sso-auth-v1";
const hawkvisionCookieStorage={
  getItem(key){
    const prefix=encodeURIComponent(key)+"=";
    const row=document.cookie.split("; ").find(v=>v.startsWith(prefix));
    return row?decodeURIComponent(row.slice(prefix.length)):null;
  },
  setItem(key,value){
    document.cookie=`${encodeURIComponent(key)}=${encodeURIComponent(value)}; Domain=.hawkvisionai.com; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
  },
  removeItem(key){
    document.cookie=`${encodeURIComponent(key)}=; Domain=.hawkvisionai.com; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  }
};

  const client=supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{storage:hawkvisionCookieStorage,storageKey:HAWKVISION_AUTH_COOKIE,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });

  async function globalLogout(){
    await client.auth.signOut({scope:"global"}).catch(()=>{});
    window.location.href="https://hawkvisionai.com/";
  }

  async function boot(){
    document.getElementById("analysisHomeBtn")?.addEventListener("click",()=>window.location.href="https://hawkvisionai.com/");
    document.getElementById("analysisLogoutBtn")?.addEventListener("click",globalLogout);

    const {data:{session}}=await client.auth.getSession();
    if(!session?.user){
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
