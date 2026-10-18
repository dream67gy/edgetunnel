'use strict';
const audio=document.getElementById('audio');
if(audio) {
  const status=document.getElementById('status'), error=document.getElementById('error');
  const playing=value=>document.body.classList.toggle('playing',value && !document.hidden);
  function failed(){playing(false);error.hidden=false;status.textContent='播放遇到一点问题';}
  audio.addEventListener('playing',()=>{playing(true);error.hidden=true;status.textContent='正在播放，歌名有线索了吗？';});
  audio.addEventListener('pause',()=>{playing(false);if(!audio.ended) status.textContent='已暂停，继续听听吧。';});
  audio.addEventListener('waiting',()=>{playing(false);status.textContent='音乐加载中…';});
  audio.addEventListener('ended',()=>{playing(false);status.textContent='听完了，猜到是哪首歌了吗？';});
  audio.addEventListener('error',failed);
  async function playFromStart(reload=false) {
    error.hidden=true;
    if(reload) audio.load();
    if(audio.readyState>0) audio.currentTime=0;
    try { await audio.play(); }
    catch(e) { if(e.name!=='AbortError') failed(); }
  }
  document.getElementById('replay').onclick=()=>playFromStart();
  document.getElementById('retry').onclick=()=>playFromStart(true);
  document.addEventListener('visibilitychange',()=>playing(!audio.paused && !audio.ended));
}
