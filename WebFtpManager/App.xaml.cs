using System;
using System.IO;
using System.Windows;

namespace WebFtpManager;

public partial class App : System.Windows.Application
{
    public static string Version => "1.0.0";

    /// <summary>项目根目录（WebFtpManager.exe 一般部署在 WebFtp 根目录下）</summary>
    public static string ProjectRoot =>
        Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));

    /// <summary>调试时若上面算错了，允许通过环境变量覆盖</summary>
    public static string EffectiveProjectRoot =>
        Environment.GetEnvironmentVariable("WEBFTP_ROOT") ?? ProjectRoot;

    public static string ServiceManageScript => Path.Combine(EffectiveProjectRoot, "service", "manage.mjs");

    public static string EnvFile => Path.Combine(EffectiveProjectRoot, ".env");

    /// <summary>
    /// WebPan 根目录，需与后端 api/db.ts 保持一致：
    /// 取 .env 中的 WEBPAN_ROOT（相对路径基于项目根目录解析），缺省为项目根目录的上一级。
    /// </summary>
    public static string WebpanRoot
    {
        get
        {
            var configured = ReadEnv("WEBPAN_ROOT");
            if (!string.IsNullOrWhiteSpace(configured))
            {
                try { return Path.GetFullPath(Path.Combine(EffectiveProjectRoot, configured)); }
                catch { /* 配置非法时退回默认值 */ }
            }
            return Path.GetFullPath(Path.Combine(EffectiveProjectRoot, ".."));
        }
    }

    /// <summary>数据目录：日志与数据库随 storage 目录收敛后位于 WEBPAN_ROOT/data 下</summary>
    public static string DataDir => Path.Combine(WebpanRoot, "data");

    /// <summary>日志目录：与后端 LOGS_DIR 一致（WEBPAN_ROOT/data/logs）</summary>
    public static string LogsDir => Path.Combine(DataDir, "logs");

    /// <summary>读取 .env 中的单个键值（去除引号，忽略注释行）</summary>
    private static string? ReadEnv(string key)
    {
        try
        {
            if (!File.Exists(EnvFile)) return null;
            foreach (var line in File.ReadAllLines(EnvFile))
            {
                var t = line.Trim();
                if (t.Length == 0 || t.StartsWith("#")) continue;
                var i = t.IndexOf('=');
                if (i <= 0) continue;
                if (!string.Equals(t[..i].Trim(), key, StringComparison.OrdinalIgnoreCase)) continue;
                return t[(i + 1)..].Trim().Trim('"', '\'');
            }
        }
        catch { /* ignore */ }
        return null;
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // 全局异常捕获，避免崩溃白屏
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(args.Exception.ToString(), "WebFtp Manager 异常", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
    }
}
