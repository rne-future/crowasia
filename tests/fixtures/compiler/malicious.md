# Test Chapter
<script>alert('xss')</script>
<img src=x onerror=alert(1)>
<iframe src="https://evil.com"></iframe>
[link](javascript:alert(1))
<svg><foreignObject><body onload=alert(1)></body></foreignObject></svg>
<div onclick="steal()">click</div>
<style>body{display:none}</style>
> [!NOTE] Safe alert
> This should survive
