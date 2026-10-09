// 本地存储工具
const STORAGE_KEY = "lost_found_list";

// 获取全部数据
function getList() {
    const str = localStorage.getItem(STORAGE_KEY);
    if(!str) return [];
    return JSON.parse(str);
}

// 保存全部数据
function saveList(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// 添加一条新记录
function addItem(item) {
    const list = getList();
    // 简单唯一id
    item.id = Date.now();
    item.createTime = new Date().toLocaleString();
    item.status = "ongoing"; // ongoing:待处理 done:已完成
    list.push(item);
    saveList(list);
    return item.id;
}

// 根据id获取单条
function getItemById(id) {
    const list = getList();
    return list.find(i=>i.id == id);
}

// 修改状态
function updateItemStatus(id, status) {
    const list = getList();
    const target = list.find(i=>i.id == id);
    if(target){
        target.status = status;
        saveList(list);
    }
}

// 搜索：物品名称模糊匹配 + 分类筛选
function searchList(keyword, type) {
    const list = getList();
    return list.filter(item=>{
        const matchKey = item.name.includes(keyword);
        const matchType = type === "all" || item.type === type;
        return matchKey && matchType;
    })
}
