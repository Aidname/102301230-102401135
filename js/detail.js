let currentId = null;
window.onload = function(){
    const url = new URL(window.location.href);
    currentId = url.searchParams.get("id");
    const item = getItemById(currentId);
    if(!item){
        document.getElementById("detail-box").innerHTML = "<p>信息不存在</p>";
        return;
    }
    const typeText = item.type === "lost" ? "寻物启事" : "招领启事";
    const statusText = item.status === "done" ? "✅ 已完成" : "⏳ 待处理";
    const html = `
        <h2>${typeText} ${item.name}</h2>
        <p>状态：${statusText}</p>
        <p>地点：${item.place}</p>
        <p>发布时间：${item.createTime}</p>
        <p>物品描述：${item.desc}</p>
        <p>联系方式：${item.contact}</p>
    `
    document.getElementById("detail-box").innerHTML = html;

    // 如果已经完成，隐藏标记按钮
    if(item.status === "done"){
        document.getElementById("mark-btn").style.display = "none";
    }
}

// 返回首页
function backHome(){
    window.location.href = "index.html";
}

// 标记已完成
document.getElementById("mark-btn").onclick = function(){
    if(!confirm("确认标记为【已找到/已归还】？标记后不再接受咨询")) return;
    updateItemStatus(currentId, "done");
    alert("状态更新成功！");
    window.location.reload();
}
