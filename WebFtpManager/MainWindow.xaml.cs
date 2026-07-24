using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using WebFtpManager.Pages;
using WebFtpManager.Services;
using Forms = System.Windows.Forms;

namespace WebFtpManager;

public partial class MainWindow : Window
{
    private readonly ServiceManager _svc = new();
    private readonly ApiClient _api = new();
    private CancellationTokenSource? _pollCts;
    private Forms.NotifyIcon? _notifyIcon;
    private bool _reallyClose;

    public MainWindow()
    {
        InitializeComponent();
        SetupTray();
        // 启动时显示服务页
        ContentFrame.Content = new ServicePage(_svc, _api, this);
        // 轮询服务状态
        StartStatusPolling();
    }

    public void NavigateTo(Page page) => ContentFrame.Content = page;

    /// <summary>切换 Tab</summary>
    private void Tab_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn) return;
        foreach (var child in ((Panel)btn.Parent).Children)
        {
            if (child is Button b) b.Tag = null;
        }
        btn.Tag = "Active";
        Page page = btn.Name switch
        {
            "TabService" => new ServicePage(_svc, _api, this),
            "TabStats" => new StatsPage(_api),
            "TabUsers" => new UsersPage(_api),
            "TabLogs" => new LogsPage(),
            "TabConfig" => new ConfigPage(),
            "TabSystem" => new SystemPage(_api),
            _ => new ServicePage(_svc, _api, this),
        };
        ContentFrame.Content = page;
    }

    private void OpenWeb_Click(object sender, RoutedEventArgs e)
    {
        ShellHelper.OpenUrl(ApiClient.GetBaseUrl());
    }

    private async void StartStatusPolling()
    {
        _pollCts?.Cancel();
        _pollCts = new CancellationTokenSource();
        var token = _pollCts.Token;
        await Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                var status = await _svc.GetStatusAsync();
                await Dispatcher.InvokeAsync(() =>
                {
                    StatusDot.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(status.StateColor));
                    StatusText.Text = status.StateText;
                    StatusDetail.Text = status.Installed
                        ? $"启动类型: {(status.AutoStart ? "开机自启" : "手动")}  PID: {status.Pid?.ToString() ?? "-"}"
                        : "未安装服务";
                });
                try { await Task.Delay(3000, token); } catch { /* cancelled */ }
            }
        }, token);
    }

    private void SetupTray()
    {
        _notifyIcon = new Forms.NotifyIcon
        {
            Text = "WebFtp Manager",
            Visible = true,
        };
        // 用内置系统图标（在没自定义 ico 的情况下）
        _notifyIcon.Icon = System.Drawing.SystemIcons.Application;
        _notifyIcon.DoubleClick += (_, _) => ShowFromTray();

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("打开 Web", null, (_, _) => ShellHelper.OpenUrl(ApiClient.GetBaseUrl()));
        menu.Items.Add("显示主窗口", null, (_, _) => ShowFromTray());
        menu.Items.Add("-");
        menu.Items.Add("退出", null, (_, _) =>
        {
            _reallyClose = true;
            Dispatcher.Invoke(Close);
        });
        _notifyIcon.ContextMenuStrip = menu;
    }

    private void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        // 最小化时隐藏到托盘
        if (WindowState == WindowState.Minimized)
        {
            Hide();
            _notifyIcon?.ShowBalloonTip(1500, "WebFtp Manager", "程序已最小化到托盘", Forms.ToolTipIcon.Info);
        }
    }

    private void Window_Closing(object sender, CancelEventArgs e)
    {
        if (!_reallyClose)
        {
            // 关闭按钮 → 缩到托盘
            e.Cancel = true;
            Hide();
            _notifyIcon?.ShowBalloonTip(1500, "WebFtp Manager", "程序最小化到托盘，右键托盘图标退出", Forms.ToolTipIcon.Info);
            return;
        }
        // 真正退出
        _pollCts?.Cancel();
        _notifyIcon?.Dispose();
        _api.Dispose();
    }
}
