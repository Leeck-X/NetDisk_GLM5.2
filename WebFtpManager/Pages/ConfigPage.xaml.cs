using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;

namespace WebFtpManager.Pages;

public partial class ConfigPage : Page
{
    public ConfigPage()
    {
        InitializeComponent();
    }

    private void Page_Loaded(object sender, RoutedEventArgs e) => Reload();

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
}
