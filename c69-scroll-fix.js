/* Soraya C69 Scroll Recovery */
(function(){
  "use strict";
  function applyScrollFix(){
    document.documentElement.style.overflowY="auto";
    document.documentElement.style.height="auto";
    document.body.style.overflowY="auto";
    document.body.style.height="auto";
    document.body.style.minHeight="100%";
    var app=document.querySelector(".app");
    if(app){app.style.overflow="visible";app.style.height="auto";}
    var main=document.getElementById("mainContent");
    if(main){main.style.overflow="visible";main.style.height="auto";}
    document.querySelectorAll(".section.active").forEach(function(section){
      section.style.overflow="visible";
      section.style.height="auto";
    });
    var veil=document.getElementById("loadingVeil");
    if(veil && !veil.classList.contains("show")) veil.style.pointerEvents="none";
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",applyScrollFix,{once:true});
  else applyScrollFix();
  window.addEventListener("load",function(){
    applyScrollFix();
    setTimeout(applyScrollFix,400);
    setTimeout(applyScrollFix,1500);
  });
  window.addEventListener("touchmove",function(){applyScrollFix();},{passive:true});
})();
