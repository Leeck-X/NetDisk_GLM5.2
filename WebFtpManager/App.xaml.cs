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

    public static string LogsDir => Path.Combine(EffectiveProjectRoot, "logs");

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
