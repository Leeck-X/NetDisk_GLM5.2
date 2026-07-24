using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace WebFtpManager.Pages;

public partial class LogsPage : Page
{
    private string _currentType = "access";
    private CancellationTokenSource? _cts;

    public LogsPage()
    {
        InitializeComponent();
    }

    private void Page_Loaded(object sender, RoutedEventArgs e) => StartAutoRefresh();

    private void Type_Changed(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        if (RbAccess.IsChecked == true) _currentType = "access";
        else if (RbError.IsChecked == true) _currentType = "error";
        else if (RbStats.IsChecked == true) _currentType = "stats";
        _ = RefreshOnceAsync();
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) => _ = RefreshOnceAsync();

    private async Task RefreshOnceAsync()
    {
        var lines = ((ComboBoxItem)LinesCombo.SelectedItem).Content.ToString();
        var file = Path.Combine(App.LogsDir, $"webftp-{_currentType}.log");
        try
        {
            if (!File.Exists(file))
            {
                LogBox.Text = $"(空) 文件不存在: {file}";
                return;
            }
            var all = await File.ReadAllLinesAsync(file);
            var take = int.Parse(lines!);
            var tail = all.Length > take ? all[^take..] : all;
            LogBox.Text = string.Join("\n", tail);
            LogBox.ScrollToEnd();
        }
        catch (Exception ex)
        {
            LogBox.Text = "[读取失败] " + ex.Message;
        }
    }

    private async void StartAutoRefresh()
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        await RefreshOnceAsync();
        await Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                try { await Task.Delay(3000, token); } catch { break; }
                if (AutoRefreshCb.IsChecked != true) continue;
                await Dispatcher.InvokeAsync(async () => await RefreshOnceAsync());
            }
        }, token);
    }
}
