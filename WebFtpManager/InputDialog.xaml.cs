using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using WpfTextBox = System.Windows.Controls.TextBox;
using WpfTextBlock = System.Windows.Controls.TextBlock;

namespace WebFtpManager;

public partial class InputDialog : Window
{
    public List<string> Values { get; private set; } = new();
    private readonly List<WpfTextBox> _boxes = new();

    public InputDialog(string title, params string[] fieldLabels)
    {
        InitializeComponent();
        Title = title;
        Prompt.Text = title;
        foreach (var label in fieldLabels)
        {
            var tb = new WpfTextBox { Margin = new System.Windows.Thickness(0, 0, 0, 8), Padding = new System.Windows.Thickness(8, 6, 8, 6) };
            if (label.Contains("密码", StringComparison.OrdinalIgnoreCase))
            {
                // 简单掩码
                tb.Tag = "password";
            }
            _boxes.Add(tb);
            var lab = new WpfTextBlock { Text = label, FontSize = 12, Foreground = System.Windows.Media.Brushes.Gray, Margin = new System.Windows.Thickness(0, 4, 0, 2) };
            FieldsPanel.Children.Add(lab);
            FieldsPanel.Children.Add(tb);
        }
        if (_boxes.Count > 0) Loaded += (_, _) => _boxes[0].Focus();
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        Values = _boxes.Select(b => b.Text).ToList();
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
