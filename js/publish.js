const form = document.getElementById("publish-form");
form.onsubmit = function(e){
    e.preventDefault();
    const item = {
        type: document.getElementById("type").value,
        name: document.getElementById("name").value.trim(),
        place: document.getElementById("place").value.trim(),
        desc: document.getElementById("desc").value.trim(),
        contact: document.getElementById("contact").value.trim()
    }
    addItem(item);
    alert("发布成功！");
    window.location.href = "index.html";
}
