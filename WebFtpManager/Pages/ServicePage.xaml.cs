using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using WebFtpManager.Services;

namespace WebFtpManager.Pages;

public partial class ServicePage : Page
{
    private readonly ServiceManager _svc;
    private readonly ApiClient _api;
    private readonly MainWindow _win;
    private bool _loadingStatus;

    public ServicePage(ServiceManager svc, ApiClient api, MainWindow win)
    {
        _svc = svc;
        _api = api;
        _win = win;
        InitializeComponent();
        PortText.Text = TryGetPort();
    }

    private static string TryGetPort()
    {
        try
        {
            if (File.Exists(App.EnvFile))
            {
                foreach (var line in File.ReadAllLines(App.EnvFile))
                {
                    var m = Regex.Match(line, @"^\s*PORT\s*=\s*(\d+)");
                    if (m.Success) return m.Groups[1].Value;
                }
            }
        }
        catch { /* ignore */ }
        return "3000";
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e) => await RefreshAsync();

    private async void Refresh_Click(object sender, RoutedEventArgs e) => await RefreshAsync();

    private async Task RefreshAsync()
    {
        _loadingStatus = true;
        StatusText.Text = "检测中...";
        try
        {
            var s = await _svc.GetStatusAsync();
            StatusDot.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(s.StateColor));
            StatusText.Text = s.StateText;
            StatusTag.Text = s.State;
            StartTypeText.Text = s.Installed ? (s.AutoStart ? "自动" : "手动") : "-";
            PidText.Text = s.Pid?.ToString() ?? "-";
            AutoStartCb.IsChecked = s.AutoStart;
            // 服务运行时探测 API
            if (s.Running)
            {
                try
                {
                    var resp = await _api.GetAsync<object>("/api/health");
                    HealthText.Text = resp.Success ? "正常" : $"异常({resp.Message})";
                    HealthText.Foreground = new SolidColorBrush(resp.Success ? (Color)ColorConverter.ConvertFromString("#10B981") : (Color)ColorConverter.ConvertFromString("#EF4444"));
                }
                catch
                {
                    HealthText.Text = "无响应";
                    HealthText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444"));
                }
            }
            else
            {
                HealthText.Text = "-";
                HealthText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6B7280"));
            }
            // 按钮可用性
            InstallBtn.IsEnabled = !s.Installed;
            UninstallBtn.IsEnabled = s.Installed;
            StartBtn.IsEnabled = s.Installed && !s.Running;
            StopBtn.IsEnabled = s.Installed && s.Running;
            RestartBtn.IsEnabled = s.Installed && s.Running;
            AutoStartCb.IsEnabled = s.Installed;
        }
        catch (Exception ex)
        {
            StatusText.Text = "查询失败";
            AppendOutput("[错误] " + ex.Message);
        }
        finally
        {
            _loadingStatus = false;
        }
    }

    private async void Install_Click(object sender, RoutedEventArgs e)
    {
        AppendOutput("> 安装服务...");
        var out_ = await _svc.InstallAsync();
        AppendOutput(out_);
        await Task.Delay(2000);
        await RefreshAsync();
    }

    private async void Uninstall_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("确定要卸载 WebFtp 服务吗？", "确认", MessageBoxButton.OKCancel, MessageBoxImage.Warning) != MessageBoxResult.OK) return;
        AppendOutput("> 卸载服务...");
        var out_ = await _svc.UninstallAsync();
        AppendOutput(out_);
        await Task.Delay(2000);
        await RefreshAsync();
    }

    private async void Start_Click(object sender, RoutedEventArgs e)
    {
        AppendOutput("> 启动服务...");
        AppendOutput(await _svc.StartAsync());
        await Task.Delay(1500);
        await RefreshAsync();
    }

    private async void Stop_Click(object sender, RoutedEventArgs e)
    {
        AppendOutput("> 停止服务...");
        AppendOutput(await _svc.StopAsync());
        await Task.Delay(1500);
        await RefreshAsync();
    }

    private async void Restart_Click(object sender, RoutedEventArgs e)
    {
        AppendOutput("> 重启服务...");
        AppendOutput(await _svc.RestartAsync());
        await Task.Delay(2500);
        await RefreshAsync();
    }

    private async void AutoStart_Changed(object sender, RoutedEventArgs e)
    {
        if (_loadingStatus) return;
        var on = AutoStartCb.IsChecked == true;
        AppendOutput($"> 设置开机自启: {on}");
        AppendOutput(await _svc.SetAutoStartAsync(on));
        await RefreshAsync();
    }

    private void OpenWeb_Click(object sender, RoutedEventArgs e) => ShellHelper.OpenUrl(ApiClient.GetBaseUrl());

    private void OpenRoot_Click(object sender, RoutedEventArgs e) => ShellHelper.OpenFolder(App.EffectiveProjectRoot);

    private void OpenLogs_Click(object sender, RoutedEventArgs e) => ShellHelper.OpenFolder(App.LogsDir);

    private async void Build_Click(object sender, RoutedEventArgs e)
    {
        AppendOutput("> npm run build ...");
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c npm run build",
                WorkingDirectory = App.EffectiveProjectRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            var p = Process.Start(psi)!;
            p.OutputDataReceived += (_, args) => { if (args.Data != null) Dispatcher.Invoke(() => AppendOutput(args.Data)); };
            p.ErrorDataReceived += (_, args) => { if (args.Data != null) Dispatcher.Invoke(() => AppendOutput("[err] " + args.Data)); };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            await Task.Run(() => p.WaitForExit());
            AppendOutput($"< 完成 exit={p.ExitCode}");
        }
        catch (Exception ex)
        {
            AppendOutput("[错误] " + ex.Message);
        }
    }

    private void ClearOutput_Click(object sender, RoutedEventArgs e) => OutputBox.Clear();

    private void AppendOutput(string text)
    {
        OutputBox.AppendText(text + "\n");
        OutputBox.ScrollToEnd();
    }
}
