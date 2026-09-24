using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using WebFtpManager.Services;

namespace WebFtpManager.Pages;

public partial class UsersPage : Page
{
    private readonly ApiClient _api;
    private readonly ObservableCollection<UserRow> _rows = new();
    /// <summary>后台配置的新用户默认配额（GB），用于新建对话框提示文案</summary>
    private string _defaultQuotaGb = "";

    public UsersPage(ApiClient api)
    {
        _api = api;
        InitializeComponent();
        Grid.ItemsSource = _rows;
        // 自动尝试恢复会话
        var (u, p) = SessionStore.Load();
        if (!string.IsNullOrEmpty(u) && !string.IsNullOrEmpty(p))
        {
            UserBox.Text = u;
            PassBox.Password = p;
            RememberCb.IsChecked = true;
            _ = TryAutoLogin(u, p);
        }
    }

    private async Task TryAutoLogin(string u, string p)
    {
        try
        {
            var resp = await _api.LoginAsync<UserData>(u, p);
            if (resp.Success)
            {
                ShowList();
                await LoadUsersAsync();
            }
        }
        catch { /* ignore */ }
    }

    private void Page_Loaded(object sender, RoutedEventArgs e) { /* 已在构造函数处理 */ }

    private async void Login_Click(object sender, RoutedEventArgs e)
    {
        var u = UserBox.Text.Trim();
        var p = PassBox.Password;
        if (string.IsNullOrEmpty(u) || string.IsNullOrEmpty(p))
        {
            MessageBox.Show("请填写用户名和密码", "提示");
            return;
        }
        LoginBtn.IsEnabled = false;
        try
        {
            var resp = await _api.LoginAsync<UserData>(u, p);
            if (resp.Success)
            {
                if (RememberCb.IsChecked == true) SessionStore.Save(u, p);
                else SessionStore.Clear();
                ShowList();
                await LoadUsersAsync();
            }
            else
            {
                MessageBox.Show(resp.Message ?? "登录失败", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法连接到服务：" + ex.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            LoginBtn.IsEnabled = true;
        }
    }

    private void Logout_Click(object sender, RoutedEventArgs e)
    {
        _api.SetToken("");
        SessionStore.Clear();
        LoginCard.Visibility = Visibility.Visible;
        ListCard.Visibility = Visibility.Collapsed;
        PassBox.Clear();
    }

    private void ShowList()
    {
        LoginCard.Visibility = Visibility.Collapsed;
        ListCard.Visibility = Visibility.Visible;
    }

    private async Task LoadUsersAsync()
    {
        try
        {
            var resp = await _api.GetAsync<List<UserDto>>("/api/admin/users");
            if (!resp.Success)
            {
                MessageBox.Show(resp.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            _rows.Clear();
            foreach (var u in resp.Data ?? new List<UserDto>()) _rows.Add(new UserRow(u));
            await LoadDefaultQuotaAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show("加载失败：" + ex.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    /// <summary>读取后台配置的新用户默认配额，供新建用户对话框显示</summary>
    private async Task LoadDefaultQuotaAsync()
    {
        try
        {
            var resp = await _api.GetAsync<Dictionary<string, string>>("/api/admin/config");
            if (resp.Success && resp.Data != null && resp.Data.TryGetValue("default_quota_gb", out var v))
                _defaultQuotaGb = v;
        }
        catch { /* 读取失败时退化为不带默认值提示 */ }
    }

    private async void Create_Click(object sender, RoutedEventArgs e)
    {
        var hint = string.IsNullOrWhiteSpace(_defaultQuotaGb)
            ? "配额 (GB，留空用后台默认)"
            : $"配额 (GB，留空用后台默认 {_defaultQuotaGb})";
        var dlg = new InputDialog("新建用户", "用户名", "密码（至少 6 位）", hint, "角色 (admin/user，默认 user)");
        if (dlg.ShowDialog() != true) return;
        var values = dlg.Values;
        if (values.Count < 4 || string.IsNullOrEmpty(values[0]) || string.IsNullOrEmpty(values[1]))
        {
            MessageBox.Show("用户名和密码必填"); return;
        }
        var role = string.IsNullOrEmpty(values[3]) ? "user" : values[3];
        var payload = new Dictionary<string, object?>
        {
            ["username"] = values[0],
            ["password"] = values[1],
            ["role"] = role,
        };
        // 留空则不下发 quotaBytes，交由后端按 default_quota_gb 计算
        if (!string.IsNullOrWhiteSpace(values[2]))
        {
            if (!long.TryParse(values[2].Trim(), out var g))
            {
                MessageBox.Show("配额需填写数字（GB）"); return;
            }
            payload["quotaBytes"] = g * 1024L * 1024 * 1024;
        }
        var resp = await _api.SendAsync<object>("POST", "/api/admin/users", payload);
        if (resp.Success) await LoadUsersAsync();
        else MessageBox.Show(resp.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private async void ChangePass_Click(object sender, RoutedEventArgs e)
    {
        var id = (string)((Button)sender).Tag!;
        var dlg = new InputDialog("修改密码", "新密码（至少 6 位）");
        if (dlg.ShowDialog() != true || dlg.Values.Count == 0) return;
        var pass = dlg.Values[0];
        if (string.IsNullOrEmpty(pass) || pass.Length < 6) { MessageBox.Show("密码至少 6 位"); return; }
        var resp = await _api.SendAsync<object>("PATCH", $"/api/admin/users/{id}", new { password = pass });
        MessageBox.Show(resp.Success ? "已修改" : resp.Message, resp.Success ? "提示" : "错误",
                        MessageBoxButton.OK, resp.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
    }

    private async void Quota_Click(object sender, RoutedEventArgs e)
    {
        var id = (string)((Button)sender).Tag!;
        var dlg = new InputDialog("修改配额", "新配额 (GB)");
        if (dlg.ShowDialog() != true || dlg.Values.Count == 0) return;
        if (!long.TryParse(dlg.Values[0], out var g)) { MessageBox.Show("请输入数字"); return; }
        var resp = await _api.SendAsync<object>("PATCH", $"/api/admin/users/{id}", new { quotaBytes = g * 1024L * 1024 * 1024 });
        MessageBox.Show(resp.Success ? "已修改" : resp.Message, resp.Success ? "提示" : "错误",
                        MessageBoxButton.OK, resp.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
        if (resp.Success) await LoadUsersAsync();
    }

    private async void ToggleEnabled_Click(object sender, RoutedEventArgs e)
    {
        var id = (string)((Button)sender).Tag!;
        var row = _rows.FirstOrDefault(x => x.Id == id);
        if (row == null) return;
        var next = !row.Enabled;
        var resp = await _api.SendAsync<object>("PATCH", $"/api/admin/users/{id}", new { enabled = next });
        if (resp.Success) await LoadUsersAsync();
        else MessageBox.Show(resp.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private async void Delete_Click(object sender, RoutedEventArgs e)
    {
        var id = (string)((Button)sender).Tag!;
        var row = _rows.FirstOrDefault(x => x.Id == id);
        if (row == null) return;
        if (row.IsSuper) { MessageBox.Show("超级管理员不可删除"); return; }
        if (row.Role == "admin")
        {
            MessageBox.Show("请先将该管理员降级为普通用户，再删除");
            return;
        }
        if (MessageBox.Show($"确定删除用户 {row.Username}？此操作会清除其所有文件。", "二次确认",
            MessageBoxButton.OKCancel, MessageBoxImage.Warning) != MessageBoxResult.OK) return;
        if (MessageBox.Show("再次确认：删除后无法恢复", "最终确认",
            MessageBoxButton.OKCancel, MessageBoxImage.Warning) != MessageBoxResult.OK) return;
        var resp = await _api.SendAsync<object>("DELETE", $"/api/admin/users/{id}", null);
        if (resp.Success) await LoadUsersAsync();
        else MessageBox.Show(resp.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
    }
}

public class UserDto
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string Role { get; set; } = "";
    public bool Enabled { get; set; }
    public long QuotaBytes { get; set; }
    public long UsedBytes { get; set; }
    public string QuotaHuman { get; set; } = "";
    public string UsedHuman { get; set; } = "";
    public int UsedPercent { get; set; }
    public bool IsSuper { get; set; }
    public string CreatedAt { get; set; } = "";
}

public class UserRow
{
    public UserDto Dto { get; }
    public UserRow(UserDto d) => Dto = d;
    public string Id => Dto.Id;
    public string Username => Dto.Username;
    public string Role => Dto.Role;
    public bool IsSuper => Dto.IsSuper;
    public string RoleText => Dto.IsSuper ? "超级管理员" : Dto.Role == "admin" ? "管理员" : "用户";
    public bool Enabled => Dto.Enabled;
    public string StatusText => Dto.Enabled ? "启用" : "禁用";
    public string QuotaText => $"{Dto.UsedHuman} / {Dto.QuotaHuman}  ({Dto.UsedPercent}%)";
    public string CreatedAt => Dto.CreatedAt;
    public bool CanDelete => !Dto.IsSuper;
}
