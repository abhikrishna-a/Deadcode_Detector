import os
import sys
import math
from datetime import datetime


def unused_function():
    x = 10
    y = 20
    return x + y


unused_variable = 42
another_unused = "hello"


def used_function():
    return "I am used"


def complex_function(a, b):
    result = a * b
    print(f"Result: {result}")
    return result


if __name__ == "__main__":
    print(used_function())
    complex_function(3, 4)
