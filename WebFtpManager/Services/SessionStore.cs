using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

namespace WebFtpManager.Services;

/// <summary>登录凭据持久化（保存在 %AppData%\WebFtpManager\session.json）</summary>
public static class SessionStore
{
    private static string Dir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WebFtpManager");
    private static string File => Path.Combine(Dir, "session.json");

    public static (string user, string pass) Load()
    {
        try
        {
            if (!System.IO.File.Exists(File)) return ("", "");
            var json = System.IO.File.ReadAllText(File);
            var m = Regex.Match(json, @"""user""\s*:\s*""([^""]*)""");
            var p = Regex.Match(json, @"""pass""\s*:\s*""([^""]*)""");
            return (m.Success ? m.Groups[1].Value : "", p.Success ? p.Groups[1].Value : "");
        }
        catch { return ("", ""); }
    }

    public static void Save(string user, string pass)
    {
        try
        {
            Directory.CreateDirectory(Dir);
            var json = $"{{\"user\":\"{user.Replace("\"", "\\\"")}\",\"pass\":\"{pass.Replace("\"", "\\\"")}\"}}";
            System.IO.File.WriteAllText(File, json);
        }
        catch { /* ignore */ }
    }

    public static void Clear()
    {
        try { if (System.IO.File.Exists(File)) System.IO.File.Delete(File); } catch { /* ignore */ }
    }
}

/// <summary>简单的进程启动工具</summary>
public static class ShellHelper
{
    public static void OpenUrl(string url)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            };
            Process.Start(psi);
        }
        catch { /* ignore */ }
    }

    public static void OpenFolder(string path)
    {
        if (Directory.Exists(path)) OpenUrl(path);
    }
}
