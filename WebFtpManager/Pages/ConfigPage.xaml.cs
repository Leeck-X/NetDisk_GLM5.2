using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using WebFtpManager.Services;

namespace WebFtpManager.Pages;

public partial class ConfigPage : Page
{
    private readonly ApiClient _api;

    public ConfigPage(ApiClient api)
    {
        _api = api;
        InitializeComponent();
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e)
    {
        LoadServer();
        Reload();
        await ReloadRuntimeAsync();
    }

    private void LoadServer()
    {
        ServerUrlBox.Text = ManagerSettings.ServerUrl;
        RefreshServerHint();
    }

    private void RefreshServerHint()
    {
        SrvHint.Text = "当前生效：" + ApiClient.GetBaseUrl();
        SrvHint.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6B7280"));
    }

    private async void SrvSave_Click(object sender, RoutedEventArgs e)
    {
        var url = ManagerSettings.Normalize(ServerUrlBox.Text);
        ManagerSettings.SaveServerUrl(url);
        ServerUrlBox.Text = url;
        // 地址变更后，原先针对旧地址获取的登录态失效，重新登录新地址
        _api.ClearToken();
        RefreshServerHint();
        MessageBox.Show(
            url.Length == 0 ? "已恢复为「本机默认」，将按 .env 的 PORT 连接。" : $"已保存服务器地址：{url}",
            "提示", MessageBoxButton.OK, MessageBoxImage.Information);
        await ReloadRuntimeAsync();
    }

    private async void SrvTest_Click(object sender, RoutedEventArgs e)
    {
        var url = ManagerSettings.Normalize(ServerUrlBox.Text);
        var target = url.Length == 0 ? ApiClient.GetLocalBaseUrl() : url;
        SrvHint.Text = "正在测试连接...";
        try
        {
            var resp = await _api.PingAsync(target);
            if (resp.Success)
            {
                SrvHint.Text = $"连接成功：{target}";
                SrvHint.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10B981"));
            }
            else
            {
                SrvHint.Text = $"连接失败：{target}（{resp.Message ?? "无响应"}）";
                SrvHint.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
            }
        }
        catch (Exception ex)
        {
            SrvHint.Text = $"连接失败：{target}（{ex.Message}）";
            SrvHint.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
        }
    }

    private async void SrvDefault_Click(object sender, RoutedEventArgs e)
    {
        ManagerSettings.ClearServerUrl();
        ServerUrlBox.Text = "";
        _api.ClearToken();
        RefreshServerHint();
        await ReloadRuntimeAsync();
    }

    private void Reload_Click(object sender, RoutedEventArgs e) => Reload();

    private void Reload()
    {
        if (!File.Exists(App.EnvFile))
        {
            RawBox.Text = "# .env 不存在，保存后将自动创建\nPORT=3000\nHOST=0.0.0.0\nJWT_SECRET=\n";
            PortBox.Text = "3000";
            HostBox.Text = "0.0.0.0";
            JwtBox.Text = "";
            return;
        }
        var text = File.ReadAllText(App.EnvFile);
        RawBox.Text = text;
        PortBox.Text = Get(text, "PORT") ?? "3000";
        HostBox.Text = Get(text, "HOST") ?? "0.0.0.0";
        JwtBox.Text = Get(text, "JWT_SECRET") ?? "";
    }

    private static string? Get(string text, string key)
    {
        var m = Regex.Match(text, $@"(?m)^\s*{key}\s*=\s*(.*)$");
        return m.Success ? m.Groups[1].Value.Trim().Trim('"', '\'') : null;
    }

    private static void Set(ref string text, string key, string value)
    {
        var pattern = $@"(?m)^\s*{key}\s*=.*$";
        var line = $"{key}={value}";
        if (Regex.IsMatch(text, pattern)) text = Regex.Replace(text, pattern, line);
        else text = text.TrimEnd() + "\n" + line + "\n";
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // 优先用原始编辑框的内容（保留注释和顺序），否则用结构化字段
            var text = RawBox.Text;
            // 若结构化字段有改动，覆盖原始内容
            if (!string.IsNullOrWhiteSpace(PortBox.Text)) Set(ref text, "PORT", PortBox.Text.Trim());
            if (!string.IsNullOrWhiteSpace(HostBox.Text)) Set(ref text, "HOST", HostBox.Text.Trim());
            if (!string.IsNullOrWhiteSpace(JwtBox.Text)) Set(ref text, "JWT_SECRET", JwtBox.Text.Trim());
            File.WriteAllText(App.EnvFile, text);
            MessageBox.Show("已保存。修改需要重启服务才能生效。", "提示", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show("保存失败：" + ex.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void RtReload_Click(object sender, RoutedEventArgs e) => await ReloadRuntimeAsync();

    /// <summary>从后端读取运行时配置（GET /api/admin/config），回填各字段</summary>
    private async Task ReloadRuntimeAsync()
    {
        SetHint("正在读取运行时配置...", false);
        try
        {
            if (!await _api.EnsureLoginAsync())
            {
                SetHint("未登录：请到「用户」页登录并勾选“记住登录”，然后回到此页重新加载。", true);
                return;
            }
            var resp = await _api.GetAsync<Dictionary<string, string>>("/api/admin/config");
            if (!resp.Success || resp.Data == null)
            {
                SetHint("读取失败：" + (resp.Message ?? "未知错误"), true);
                return;
            }
            var c = resp.Data;
            SiteNameBox.Text = GetConfig(c, "site_name");
            SiteDescBox.Text = GetConfig(c, "site_description");
            DefaultQuotaBox.Text = GetConfig(c, "default_quota_gb");
            UploadMaxBox.Text = GetConfig(c, "upload_max_size");
            ShareExpireBox.Text = GetConfig(c, "share_default_expire_days");
            TrashDaysBox.Text = GetConfig(c, "trash_retention_days");
            AllowRegisterCb.IsChecked = GetConfig(c, "allow_register").Trim().ToLower() is "1" or "true";
            SetHint("已加载当前生效的配置。", false);
        }
        catch (Exception ex)
        {
            SetHint("读取失败：" + ex.Message, true);
        }
    }

    private async void RtSave_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!await _api.EnsureLoginAsync())
            {
                SetHint("未登录：请到「用户」页登录并勾选“记住登录”。", true);
                return;
            }
            // 数值项做基本校验，避免把非法值写入库而影响后端逻辑
            if (!TryValidateNumber(DefaultQuotaBox.Text, "新用户默认配额", out var quota)) return;
            if (!TryValidateNumber(UploadMaxBox.Text, "单文件上传上限", out var uploadMax)) return;
            if (!TryValidateNumber(ShareExpireBox.Text, "分享默认有效期", out var shareExpire)) return;
            if (!TryValidateNumber(TrashDaysBox.Text, "回收站保留天数", out var trashDays)) return;

            var payload = new Dictionary<string, string>
            {
                ["site_name"] = SiteNameBox.Text.Trim(),
                ["site_description"] = SiteDescBox.Text.Trim(),
                ["default_quota_gb"] = quota,
                ["upload_max_size"] = uploadMax,
                ["share_default_expire_days"] = shareExpire,
                ["trash_retention_days"] = trashDays,
                ["allow_register"] = AllowRegisterCb.IsChecked == true ? "1" : "0",
            };
            var resp = await _api.SendAsync<object>("PATCH", "/api/admin/config", payload);
            if (resp.Success)
            {
                SetHint("已保存，配置立即生效。", false);
                MessageBox.Show("运行时配置已保存并生效。", "提示", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                SetHint("保存失败：" + (resp.Message ?? "未知错误"), true);
                MessageBox.Show(resp.Message ?? "保存失败", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            SetHint("保存失败：" + ex.Message, true);
        }
    }

    private static string GetConfig(Dictionary<string, string> c, string key) =>
        c.TryGetValue(key, out var v) ? v : "";

    /// <summary>数值项校验：允许留空（留空表示不改，交由后端默认值处理）</summary>
    private static bool TryValidateNumber(string text, string label, out string value)
    {
        value = text.Trim();
        if (value.Length == 0) { value = ""; return true; }
        if (!double.TryParse(value, out _))
        {
            MessageBox.Show($"{label} 需填写数字", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return false;
        }
        return true;
    }

    private void SetHint(string text, bool error)
    {
        RtHint.Text = text;
        RtHint.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(error ? "#DC2626" : "#6B7280"));
    }
}
