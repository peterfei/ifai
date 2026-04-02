// 用户认证系统
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = JSON.parse(localStorage.getItem('2048-users')) || {};
        this.isLoggedIn = false;
        
        // 初始化
        this.init();
    }
    
    // 初始化认证系统
    init() {
        // 检查是否有已登录的用户
        const savedUser = localStorage.getItem('2048-current-user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                this.isLoggedIn = true;
                this.updateUserUI();
            } catch (e) {
                console.error('解析用户数据失败:', e);
                localStorage.removeItem('2048-current-user');
            }
        }
        
        // 绑定事件
        this.bindEvents();
    }
    
    // 绑定事件
    bindEvents() {
        // 登录按钮
        document.getElementById('login-btn').addEventListener('click', () => this.showLoginModal());
        
        // 关闭登录模态框
        document.getElementById('close-login').addEventListener('click', () => this.hideLoginModal());
        
        // 切换登录/注册表单
        document.getElementById('switch-to-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToRegister();
        });
        
        document.getElementById('switch-to-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToLogin();
        });
        
        // 登录表单提交
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
        
        // 注册表单提交
        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.register();
        });
        
        // 点击模态框外部关闭
        document.getElementById('login-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('login-modal')) {
                this.hideLoginModal();
            }
        });
    }
    
    // 显示登录模态框
    showLoginModal() {
        const modal = document.getElementById('login-modal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // 重置表单
        this.resetForms();
        
        // 显示登录表单
        this.switchToLogin();
    }
    
    // 隐藏登录模态框
    hideLoginModal() {
        const modal = document.getElementById('login-modal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    
    // 切换到注册表单
    switchToRegister() {
        document.getElementById('login-form').classList.remove('active');
        document.getElementById('register-form').classList.add('active');
        document.getElementById('auth-status').textContent = '';
    }
    
    // 切换到登录表单
    switchToLogin() {
        document.getElementById('register-form').classList.remove('active');
        document.getElementById('login-form').classList.add('active');
        document.getElementById('auth-status').textContent = '';
    }
    
    // 重置表单
    resetForms() {
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm').value = '';
        document.getElementById('auth-status').textContent = '';
    }
    
    // 登录
    login() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const status = document.getElementById('auth-status');
        
        // 验证输入
        if (!username || !password) {
            status.textContent = '请输入用户名和密码';
            status.className = 'auth-status error';
            return;
        }
        
        // 检查用户是否存在
        if (!this.users[username]) {
            status.textContent = '用户不存在';
            status.className = 'auth-status error';
            return;
        }
        
        // 验证密码
        if (this.users[username].password !== this.hashPassword(password)) {
            status.textContent = '密码错误';
            status.className = 'auth-status error';
            return;
        }
        
        // 登录成功
        this.currentUser = {
            username: username,
            email: this.users[username].email,
            bestScore: this.users[username].bestScore || 0,
            gamesPlayed: this.users[username].gamesPlayed || 0,
            totalScore: this.users[username].totalScore || 0,
            joinDate: this.users[username].joinDate || new Date().toISOString()
        };
        
        this.isLoggedIn = true;
        
        // 保存到本地存储
        localStorage.setItem('2048-current-user', JSON.stringify(this.currentUser));
        
        // 更新UI
        this.updateUserUI();
        
        // 显示成功消息
        status.textContent = '登录成功！';
        status.className = 'auth-status success';
        
        // 2秒后关闭模态框
        setTimeout(() => {
            this.hideLoginModal();
            this.showWelcomeMessage();
        }, 2000);
    }
    
    // 注册
    register() {
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value.trim();
        const confirm = document.getElementById('register-confirm').value.trim();
        const status = document.getElementById('auth-status');
        
        // 验证输入
        if (!username || !email || !password || !confirm) {
            status.textContent = '请填写所有字段';
            status.className = 'auth-status error';
            return;
        }
        
        // 验证用户名长度
        if (username.length < 3 || username.length > 20) {
            status.textContent = '用户名长度应为3-20个字符';
            status.className = 'auth-status error';
            return;
        }
        
        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            status.textContent = '请输入有效的邮箱地址';
            status.className = 'auth-status error';
            return;
        }
        
        // 验证密码长度
        if (password.length < 6) {
            status.textContent = '密码长度至少为6个字符';
            status.className = 'auth-status error';
            return;
        }
        
        // 验证密码确认
        if (password !== confirm) {
            status.textContent = '两次输入的密码不一致';
            status.className = 'auth-status error';
            return;
        }
        
        // 检查用户名是否已存在
        if (this.users[username]) {
            status.textContent = '用户名已存在';
            status.className = 'auth-status error';
            return;
        }
        
        // 创建新用户
        this.users[username] = {
            email: email,
            password: this.hashPassword(password),
            bestScore: 0,
            gamesPlayed: 0,
            totalScore: 0,
            joinDate: new Date().toISOString()
        };
        
        // 保存用户数据
        localStorage.setItem('2048-users', JSON.stringify(this.users));
        
        // 自动登录
        this.currentUser = {
            username: username,
            email: email,
            bestScore: 0,
            gamesPlayed: 0,
            totalScore: 0,
            joinDate: this.users[username].joinDate
        };
        
        this.isLoggedIn = true;
        localStorage.setItem('2048-current-user', JSON.stringify(this.currentUser));
        
        // 显示成功消息
        status.textContent = '注册成功！正在自动登录...';
        status.className = 'auth-status success';
        
        // 2秒后关闭模态框
        setTimeout(() => {
            this.hideLoginModal();
            this.updateUserUI();
            this.showWelcomeMessage();
        }, 2000);
    }
    
    // 哈希密码（简单实现，实际项目中应使用更安全的方法）
    hashPassword(password) {
        // 简单哈希，实际项目应使用bcrypt等
        return btoa(password + '2048-salt');
    }
    
    // 更新用户界面
    updateUserUI() {
        const userInfo = document.getElementById('user-info');
        const usernameSpan = document.getElementById('username');
        const loginBtn = document.getElementById('login-btn');
        
        if (this.isLoggedIn && this.currentUser) {
            // 显示用户信息
            userInfo.style.display = 'flex';
            usernameSpan.textContent = this.currentUser.username;
            
            // 更新登录按钮为登出
            loginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 登出';
            loginBtn.classList.remove('btn-success');
            loginBtn.classList.add('btn-warning');
            
            // 更新点击事件
            loginBtn.removeEventListener('click', () => this.showLoginModal());
            loginBtn.addEventListener('click', () => this.logout());
            
            // 更新最高分显示
            const bestScoreElement = document.getElementById('best-score');
            const userBestScore = this.currentUser.bestScore || 0;
            const localBestScore = parseInt(localStorage.getItem('2048-best-score')) || 0;
            
            // 显示用户最高分和本地最高分中的较大值
            const displayScore = Math.max(userBestScore, localBestScore);
            bestScoreElement.textContent = displayScore;
            
            // 保存用户最高分到本地存储
            if (userBestScore > localBestScore) {
                localStorage.setItem('2048-best-score', userBestScore);
            }
        } else {
            // 隐藏用户信息
            userInfo.style.display = 'none';
            
            // 恢复登录按钮
            loginBtn.innerHTML = '<i class="fas fa-user"></i> 登录/注册';
            loginBtn.classList.remove('btn-warning');
            loginBtn.classList.add('btn-success');
            
            // 恢复点击事件
            loginBtn.removeEventListener('click', () => this.logout());
            loginBtn.addEventListener('click', () => this.showLoginModal());
        }
    }
    
    // 登出
    logout() {
        if (confirm('确定要登出吗？')) {
            this.currentUser = null;
            this.isLoggedIn = false;
            localStorage.removeItem('2048-current-user');
            this.updateUserUI();
            this.showLogoutMessage();
        }
    }
    
    // 显示欢迎消息
    showWelcomeMessage() {
        if (this.currentUser) {
            alert(`欢迎回来，${this.currentUser.username}！\n你的最高分：${this.currentUser.bestScore || 0}`);
        }
    }
    
    // 显示登出消息
    showLogoutMessage() {
        alert('已成功登出！');
    }
    
    // 更新用户分数
    updateUserScore(score) {
        if (!this.isLoggedIn || !this.currentUser) return;
        
        const username = this.currentUser.username;
        
        // 更新用户数据
        this.users[username].gamesPlayed = (this.users[username].gamesPlayed || 0) + 1;
        this.users[username].totalScore = (this.users[username].totalScore || 0) + score;
        
        // 更新最高分
        if (score > (this.users[username].bestScore || 0)) {
            this.users[username].bestScore = score;
            this.currentUser.bestScore = score;
            
            // 保存到本地存储
            localStorage.setItem('2048-current-user', JSON.stringify(this.currentUser));
        }
        
        // 保存用户数据
        localStorage.setItem('2048-users', JSON.stringify(this.users));
        
        // 更新UI
        this.updateUserUI();
    }
    
    // 获取当前用户
    getCurrentUser() {
        return this.currentUser;
    }
    
    // 检查是否登录
    isAuthenticated() {
        return this.isLoggedIn;
    }
}

// 创建全局认证实例
let auth = null;

// 页面加载完成后初始化认证系统
document.addEventListener('DOMContentLoaded', () => {
    auth = new AuthSystem();
});

// 导出认证系统（用于其他模块）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthSystem;
}