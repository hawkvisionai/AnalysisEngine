(() => {
  "use strict";
  const SUPABASE_URL="https://rwxujvpakpemiwkitltk.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_aN_1_fzAV3hR6FmW7FTZGg_6SF0MUHF";
  const PRODUCT_KEY="analysis_engine";
  const ACCESS_CHECK_MS=1500;

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
  window.hvAnalysisAuthClient=client;

  let currentUserId="";
  let accessWatch=null;
  let checking=false;
  let accessLocked=false;
  let logoutInProgress=false;

  function authCover(){
    return document.getElementById("hvAuthCover");
  }
  function authCoverCard(){
    return authCover()?.querySelector(".hv-auth-card");
  }
  function showLocked(message){
    accessLocked=true;
    document.body.classList.remove("hv-auth-ready");
    const card=authCoverCard();
    if(card)card.textContent=message||"分析引擎權限目前未開放";
  }
  function showReady(){
    accessLocked=false;
    const card=authCoverCard();
    if(card)card.textContent="正在載入 HawkVision…";
    document.body.classList.add("hv-auth-ready");
  }

  async function globalLogout(){
    if(logoutInProgress)return;
    logoutInProgress=true;
    window.__hvLogoutInProgress=true;
    if(accessWatch){clearInterval(accessWatch);accessWatch=null;}
    currentUserId="";checking=false;
    document.body.classList.remove("hv-auth-ready");
    try{await client.auth.signOut({scope:"global"})}catch(error){console.warn("HawkVision logout",error)}
    hvClearActiveUser();
    window.location.replace("https://hawkvisionai.com/?logout=1");
  }

  window.hvGlobalLogout=globalLogout;

  async function checkCurrentAccess(){
    if(checking || !currentUserId)return null;
    checking=true;
    try{
      const [
        {data:effective,error:effectiveError},
        {data:allowed,error:accessError}
      ]=await Promise.all([
        client.rpc("hv_effective_access_v2",{p_user_id:currentUserId}),
        client.rpc("hv_has_product_access",{
          p_user_id:currentUserId,
          p_product_key:PRODUCT_KEY
        })
      ]);

      if(effectiveError)throw effectiveError;
      if(accessError)throw accessError;

      if(effective?.allowed===false){
        showLocked(
          effective.reason==="CONTRACT"
            ?"帳號合約目前不可使用，請聯絡上層管理者"
            :"此帳號目前已停用，無法使用分析引擎"
        );
        return {allowed:false,reason:effective.reason||"ACCOUNT"};
      }

      if(allowed!==true){
        showLocked("分析引擎權限目前未開放；重新開啟後會自動恢復。");
        return {allowed:false,reason:"PRODUCT"};
      }

      showReady();
      return {allowed:true,reason:"OK"};
    }finally{
      checking=false;
    }
  }

  function startAccessWatch(){
    if(accessWatch)clearInterval(accessWatch);
    accessWatch=setInterval(()=>{
      checkCurrentAccess().catch(error=>{
        console.error("HawkVision analysis access check failed",error);
        if(accessLocked){
          const card=authCoverCard();
          if(card)card.textContent="正在重新確認分析引擎權限…";
        }
      });
    },ACCESS_CHECK_MS);
  }

  async function boot(){
    document.getElementById("analysisLogoutBtn")?.addEventListener("click",globalLogout);

    await hvAcceptSso(client).catch(()=>{});
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user || !(await hvValidateActiveIdentity(client,session))){
      window.location.replace("https://hawkvisionai.com/");
      return;
    }

    currentUserId=session.user.id;

    const result=await checkCurrentAccess();
    if(result?.reason==="ACCOUNT" || result?.reason==="CONTRACT"){
      // 保留登入狀態，但禁止分析頁面操作；若上層恢復帳號/合約，
      // 監控會自動重新確認並恢復。
    }

    const {data:profile}=await client
      .from("profiles")
      .select("display_name,email")
      .eq("id",session.user.id)
      .maybeSingle();

    const identity=document.getElementById("analysisIdentity");
    if(identity){
      const account=(profile?.email||session.user.email||"").split("@")[0];
      identity.textContent=`${profile?.display_name||account}（${account}）`;
    }

    startAccessWatch();
  }

  boot().catch((error)=>{
    if(logoutInProgress||window.__hvLogoutInProgress)return;
    console.error("HawkVision auth gate failed",error);
    window.location.replace("https://hawkvisionai.com/");
  });
})();
