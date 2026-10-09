let currentType = "all";
let searchKey = "";

// 渲染列表
function render() {
    const wrap = document.getElementById("list-wrap");
    const data = searchList(searchKey, currentType);
    if(data.length === 0){
        wrap.innerHTML = `<div class="empty-tip">暂无失物招领信息</div>`;
        return;
    }
    let html = "";
    data.forEach(item=>{
        const typeText = item.type === "lost" ? "【寻物】" : "【招领】";
        const statusText = item.status === "done" ? "已完成" : "待处理";
        const statusClass = item.status === "done" ? "status-done" : "status-ongoing";
        html += `
        <div class="card-item" onclick="goDetail(${item.id})">
            <h3>${typeText} ${item.name}<span class="status-tag ${statusClass}">${statusText}</span></h3>
            <p>地点：${item.place}</p>
            <p>时间：${item.createTime}</p>
            <p>描述：${item.desc}</p>
        </div>
        `
    })
    wrap.innerHTML = html;
}

// 跳转详情
function goDetail(id) {
    window.location.href = `detail.html?id=${id}`;
}

// 标签切换
document.querySelectorAll(".tab-item").forEach(tab=>{
    tab.onclick = function(){
        document.querySelectorAll(".tab-item").forEach(t=>t.classList.remove("active"));
        this.classList.add("active");
        currentType = this.dataset.type;
        render();
    }
})

// 搜索按钮
document.getElementById("search-btn").onclick = function(){
    searchKey = document.getElementById("search-input").value.trim();
    render();
}

// 页面加载
window.onload = function(){
    render();
}
