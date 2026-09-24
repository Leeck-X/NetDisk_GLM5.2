using System;
using System.IO;
using System.Text.Json;

namespace WebFtpManager.Services;

/// <summary>
/// 管理面板自身设置（与后端无关），保存在 %AppData%\WebFtpManager\settings.json。
/// 目前仅用于记录要连接的后端服务器地址，便于本机管理远程部署的 WebFtp。
/// </summary>
public static class ManagerSettings
{
    private static string Dir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WebFtpManager");
    private static string FilePath => Path.Combine(Dir, "settings.json");

    /// <summary>后端服务地址；为空表示自动按本机 .env 的 PORT 推导（http://127.0.0.1:端口）</summary>
    public static string ServerUrl
    {
        get
        {
            try
            {
                if (!File.Exists(FilePath)) return "";
                using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
                if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                    doc.RootElement.TryGetProperty("serverUrl", out var v) &&
                    v.ValueKind == JsonValueKind.String)
                {
                    return v.GetString() ?? "";
                }
            }
            catch { /* 配置损坏时退回默认 */ }
            return "";
        }
    }

    public static void SaveServerUrl(string url)
    {
        try
        {
            Directory.CreateDirectory(Dir);
            var payload = JsonSerializer.Serialize(new { serverUrl = Normalize(url) });
            File.WriteAllText(FilePath, payload);
        }
        catch { /* ignore */ }
    }

    public static void ClearServerUrl() => SaveServerUrl("");

    /// <summary>
    /// 规整地址：去除首尾空白；缺少协议时补 http://；去掉末尾斜杠。
    /// 空字符串表示「使用本机默认」。
    /// </summary>
    public static string Normalize(string? url)
    {
        var u = (url ?? "").Trim();
        if (u.Length == 0) return "";
        if (!u.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !u.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            u = "http://" + u;
        }
        return u.TrimEnd('/');
    }
}
