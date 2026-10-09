# covers: apps/main/src/preferences.ts, apps/main/src/window-chrome.ts, packages/contracts/src/preferences.ts, apps/renderer/src/components/Chrome.tsx, apps/renderer/src/components/Sidebar.tsx, apps/renderer/src/screens/Settings.tsx, apps/renderer/src/lib/theme.ts, apps/renderer/src/styles/tokens.css
@ui @req-PLAT-01 @req-PLAT-02 @req-PLAT-03
Feature: A custom, themed desktop shell that keeps native window behavior
  Danesh draws its own title bar, window controls, sidebar and themes while Main keeps every window action validated.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  # n/a kind-cancellation: no shell operation is cancellable; window actions are instantaneous and a theme choice applies immediately.

  @plan-01-17 @kind-happy
  Scenario: Custom title bar controls act on the real window
    Given Danesh is launched with that library folder
    Then the window has no OS title bar and the Danesh title bar shows «دانش» and the current screen name
    And the platform's window controls are placed at the physical right
    When I press the maximize control
    Then the window is maximized and the control reads «بازگرداندن»
    When I press the maximize control
    Then the window is restored and the control reads «بزرگ کردن»
    When I press the minimize control
    Then the window is minimized
    When the window is restored by the operating system
    And I press the close control
    Then the window closes through the normal close path

  @plan-01-17 @kind-persistence
  Scenario: The theme choice and window size survive a relaunch
    Given Danesh is launched with that library folder
    When I open «تنظیمات» from the sidebar and choose «تیره»
    Then the page uses the dark tokens and the native theme source is "dark"
    When the window is resized to 900 by 640
    And the app is closed and reopened with the same library folder
    Then the window background and the first rendered frame are dark
    And «تیره» is the selected theme in Settings
    And the window size is 900 by 640

  @plan-01-17 @kind-edge
  Scenario: System theme follows the operating system live
    Given Danesh is launched with that library folder
    Then «هماهنگ با سیستم» is the selected theme in Settings
    When the operating system appearance becomes dark
    Then the page uses the dark tokens
    When the operating system appearance becomes light
    Then the page uses the light tokens

  @plan-01-17 @kind-invalid
  Scenario: Malformed window and theme requests are rejected before any effect
    Given Danesh is launched with that library folder
    When the page asks "shell.window" for action "openDevTools"
    And the page asks "shell.setTheme" for theme "neon"
    And the page asks "shell.setTheme" with an unexpected extra field
    Then each request fails with INVALID_INPUT
    And the window state and the saved preferences are unchanged
    And "window.danesh" still exposes only "call" and "on"

  @plan-01-17 @kind-recovery
  Scenario: Corrupted preferences and off-screen bounds never block start-up
    Given that library contains a corrupted "ui-preferences.json"
    When Danesh is launched with that library folder
    Then Home is shown with the System theme in a visible window of the default size
    Given that library's preferences place the window far outside every display
    When the app is closed and reopened with the same library folder
    Then the window lies inside the primary display's work area

  @plan-01-17 @kind-edge
  Scenario: The sidebar collapses to a named rail and navigates
    Given Danesh is launched with that library folder
    Then the sidebar marks «خانه» as the current page
    When I collapse the sidebar with the keyboard
    Then the sidebar is a rail whose links keep the names «خانه», «بررسی سامانه» and «تنظیمات»
    When I activate «بررسی سامانه» in the sidebar
    Then the route is "#/system-check" and its h1 «بررسی سامانه» has focus
    And the sidebar marks «بررسی سامانه» as the current page
    When the app is closed and reopened with the same library folder
    Then the sidebar is still collapsed

  @plan-01-17 @kind-edge
  Scenario: Reduced motion removes animation
    Given Danesh is launched with that library folder
    When reduced motion is preferred
    Then every motion duration token is 0ms and the spinner does not rotate

  @plan-01-17 @kind-edge
  Scenario: Keyboard shortcuts work without a menu bar and on any keyboard layout
    Given Danesh is launched with that library folder
    When I press CmdOrCtrl and the physical 2 key
    Then the route is "#/system-check" and its h1 «بررسی سامانه» has focus
    When I press CmdOrCtrl and the physical comma key
    Then the route is "#/settings" and its h1 «تنظیمات» has focus
    When I press CmdOrCtrl and the physical equals key
    Then the page zoom level is above 0
    When I press CmdOrCtrl and the physical 0 key
    Then the page zoom level is 0

  @plan-01-17 @kind-edge
  Scenario: The title bar carries no application menu
    Given Danesh is launched with that library folder
    Then the title bar holds only the brand, the screen name and the window controls
    And there is no native application menu on Windows and Linux
